// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { checkVoucher, redeemVoucher } = vi.hoisted(() => ({ checkVoucher: vi.fn(), redeemVoucher: vi.fn() }))
vi.mock('../api', () => ({ api: { checkVoucher, redeemVoucher } }))

import RedeemForm from './RedeemForm.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
  checkVoucher.mockReset()
  redeemVoucher.mockReset()
})

async function render(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<RedeemForm onRedeemed={() => {}} {...props} />))
  return container
}

// React verfolgt den zuletzt gerenderten Input-Wert intern; ein simples input.value = x lässt das
// anschließende "input"-Event wirkungslos wirken. Der native Setter am Prototyp umgeht das.
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

function setInputValue(input, value) {
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function codeInput() {
  return container.querySelector('#redeem-code')
}

describe('RedeemForm – Code-Feld', () => {
  test('formatiert die Eingabe live als XXXX-XXXX-XXXX', async () => {
    await render()
    await act(async () => setInputValue(codeInput(), 'abcd1234hjkm'))
    expect(codeInput().value).toBe('ABCD-1234-HJKM')
  })

  test('übernimmt initialCode vorformatiert', async () => {
    await render({ initialCode: 'abcd1234hjkm' })
    expect(codeInput().value).toBe('ABCD-1234-HJKM')
  })

  test('prüft einen vollständigen Code beim Verlassen des Felds und zeigt "Gutschein gültig"', async () => {
    checkVoucher.mockResolvedValue({ status: 'offen' })
    await render()
    await act(async () => setInputValue(codeInput(), 'abcd1234hjkm'))
    await act(async () => codeInput().dispatchEvent(new Event('focusout', { bubbles: true })))

    expect(checkVoucher).toHaveBeenCalledWith('ABCD-1234-HJKM')
    expect(container.textContent).toContain('Gutschein gültig')
  })

  test('zeigt bei einem bereits eingelösten Gutschein einen erklärenden Text und sperrt den Absenden-Knopf', async () => {
    checkVoucher.mockResolvedValue({ status: 'eingelöst' })
    await render()
    await act(async () => setInputValue(codeInput(), 'abcd1234hjkm'))
    await act(async () => codeInput().dispatchEvent(new Event('focusout', { bubbles: true })))

    expect(container.textContent).toContain('schon eingelöst')
    expect(container.querySelector('button[type="submit"]').disabled).toBe(true)
  })

  test('prüft nicht bei einem noch unvollständigen Code', async () => {
    await render()
    await act(async () => setInputValue(codeInput(), 'abcd12'))
    await act(async () => codeInput().dispatchEvent(new Event('focusout', { bubbles: true })))

    expect(checkVoucher).not.toHaveBeenCalled()
  })
})

describe('RedeemForm – Absenden', () => {
  function fillBase() {
    setInputValue(codeInput(), 'abcd1234hjkm')
    setInputValue(container.querySelector('#redeem-name'), 'Zuhause am Deich')
  }

  test('sendet Code, Namen und das (leere) Honeypot-Feld "website"', async () => {
    redeemVoucher.mockResolvedValue({ id: 1, name: 'Zuhause am Deich', art: 'zuhause', key: 'ABCD-1234-HJKM', fromOthers: true })
    await render()
    await act(async () => fillBase())
    await act(async () => container.querySelector('form').requestSubmit())

    expect(redeemVoucher).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ABCD-1234-HJKM', name: 'Zuhause am Deich', website: '' })
    )
  })

  test('sendet Benutzername, Passwort und E-Mail, wenn der Bereich "Benutzername …" geöffnet und ausgefüllt ist', async () => {
    redeemVoucher.mockResolvedValue({ id: 1, name: 'Zuhause am Deich', art: 'zuhause', key: 'ABCD-1234-HJKM', fromOthers: true })
    await render()
    await act(async () => fillBase())
    act(() => container.querySelector('.expand-toggle').click())
    await act(async () => {
      setInputValue(container.querySelector('#redeem-username'), 'nele')
      setInputValue(container.querySelector('#redeem-password'), 'geheim1234')
      setInputValue(container.querySelector('#redeem-email'), 'nele@example.test')
    })
    await act(async () => container.querySelector('form').requestSubmit())

    expect(redeemVoucher).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'nele', password: 'geheim1234', email: 'nele@example.test' })
    )
  })

  test('ruft onRedeemed mit der vollen Server-Antwort auf', async () => {
    const onRedeemed = vi.fn()
    const response = { id: 1, name: 'Zuhause am Deich', art: 'zuhause', key: 'ABCD-1234-HJKM', fromOthers: true }
    redeemVoucher.mockResolvedValue(response)
    await render({ onRedeemed })
    await act(async () => fillBase())
    await act(async () => container.querySelector('form').requestSubmit())

    expect(onRedeemed).toHaveBeenCalledWith(response)
  })

  test('ein Fehler vom Server erscheint als Alert, onRedeemed bleibt aus', async () => {
    const onRedeemed = vi.fn()
    redeemVoucher.mockRejectedValue(new Error('Dieser Gutschein wurde schon eingelöst'))
    await render({ onRedeemed })
    await act(async () => fillBase())
    await act(async () => container.querySelector('form').requestSubmit())

    expect(container.querySelector('[role="alert"]').textContent).toBe('Dieser Gutschein wurde schon eingelöst')
    expect(onRedeemed).not.toHaveBeenCalled()
  })

  test('zeigt einen übergebenen Hinweistext (z. B. nach 409 beim Anmelden) und kündigt ihn per role="status" an', async () => {
    await render({ hint: 'Das ist ein Gutschein – löst ihn ein, um eure Chronik anzulegen.' })
    expect(container.textContent).toContain('Das ist ein Gutschein – löst ihn ein, um eure Chronik anzulegen.')
    expect(container.querySelector('[role="status"]').textContent).toBe('Das ist ein Gutschein – löst ihn ein, um eure Chronik anzulegen.')
  })
})
