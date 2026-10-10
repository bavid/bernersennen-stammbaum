// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { setPartnerUeberallErlaubt, decidePartnerUeberall } = vi.hoisted(() => ({ setPartnerUeberallErlaubt: vi.fn(), decidePartnerUeberall: vi.fn() }))
vi.mock('../api', () => ({ api: { admin: { setPartnerUeberallErlaubt, decidePartnerUeberall } } }))

import AdminPartnerUeberall from './AdminPartnerUeberall.jsx'

// Phase F: „Überall sichtbar“ in der Partnerliste des Admins - Chip nur, wenn an oder vom Team ausgeschaltet.
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  setPartnerUeberallErlaubt.mockReset()
  decidePartnerUeberall.mockReset()
})

async function render(partner, onChanged = () => {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<AdminPartnerUeberall partner={partner} onChanged={onChanged} />))
}

const partner = { id: 4, name: 'Hundeschule Wiesengrund', ueberall_sichtbar: 0, ueberall_gesperrt: 0 }

describe('AdminPartnerUeberall', () => {
  test('aus und nicht gesperrt: nichts', async () => {
    await render(partner)
    expect(container.innerHTML).toBe('')
  })

  test('an: Chip und „Ausschalten“ - schaltet aus und sperrt (erlaubt: false), meldet die Änderung', async () => {
    const onChanged = vi.fn()
    setPartnerUeberallErlaubt.mockResolvedValue({ id: 4, ueberallSichtbar: false, ueberallGesperrt: true })
    await render({ ...partner, ueberall_sichtbar: 1 }, onChanged)
    expect(container.querySelector('.pill').textContent).toBe('Überall sichtbar')
    const btn = container.querySelector('button')
    expect(btn.textContent).toContain('Ausschalten')
    await act(async () => btn.click())
    expect(setPartnerUeberallErlaubt).toHaveBeenCalledWith(4, false)
    expect(onChanged).toHaveBeenCalled()
  })

  test('vom Team ausgeschaltet: Chip „vom Team ausgeschaltet“ und „Wieder erlauben“ (erlaubt: true)', async () => {
    setPartnerUeberallErlaubt.mockResolvedValue({ id: 4, ueberallSichtbar: false, ueberallGesperrt: false })
    await render({ ...partner, ueberall_gesperrt: 1 })
    expect(container.querySelector('.pill').textContent).toBe('Überall sichtbar: vom Team ausgeschaltet')
    const btn = container.querySelector('button')
    expect(btn.textContent).toContain('Wieder erlauben')
    await act(async () => btn.click())
    expect(setPartnerUeberallErlaubt).toHaveBeenCalledWith(4, true)
  })

  test('Fehler des Servers steht darunter', async () => {
    setPartnerUeberallErlaubt.mockRejectedValue(new Error('Diesen Partner gibt es nicht'))
    await render({ ...partner, ueberall_sichtbar: 1 })
    await act(async () => container.querySelector('button').click())
    expect(container.querySelector('[role="alert"]').textContent).toMatch(/gibt es nicht/)
  })

  test('beantragt: „Freigeben“ sofort, „Ablehnen“ erst mit Grund', async () => {
    const onChanged = vi.fn()
    decidePartnerUeberall.mockResolvedValue({})
    await render({ ...partner, ueberall_sichtbar: 1, ueberall_freigabe: '' }, onChanged)
    expect(container.querySelector('.pill').textContent).toBe('Deutschlandweit beantragt')
    const byText = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.startsWith(text))

    await act(async () => byText('Freigeben').click())
    expect(decidePartnerUeberall).toHaveBeenCalledWith(4, true, undefined)
    expect(onChanged).toHaveBeenCalledTimes(1)

    await act(async () => byText('Ablehnen').click())
    const submit = container.querySelector('form button[type="submit"]')
    expect(submit.disabled).toBe(true)
    const input = container.querySelector('form input')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    await act(async () => {
      setter.call(input, ' Profil noch leer ')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(decidePartnerUeberall).toHaveBeenLastCalledWith(4, false, 'Profil noch leer')
  })
})
