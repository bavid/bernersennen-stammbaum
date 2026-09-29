// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { sendAnfrage } = vi.hoisted(() => ({ sendAnfrage: vi.fn() }))
vi.mock('../api', () => ({ api: { sendAnfrage } }))

import DemoBanner from './DemoBanner.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom implementiert <dialog> nicht vollständig (kein showModal/close) - die Anfrage öffnet ein Modal.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close() {
    this.open = false
  }
}

let container
let root

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  sendAnfrage.mockReset()
})

async function render(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<DemoBanner onLeave={() => {}} {...props} />))
  return container
}

function button(label) {
  return [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim() === label)
}

describe('DemoBanner – Anfrage aus der Demo (Phase N)', () => {
  test('Haushalts-Demo: "Gutschein anfragen" neben "Eigene Familie anlegen" öffnet das Formular im Modal', async () => {
    const onLeave = vi.fn()
    await render({ onLeave })

    const banner = container.querySelector('.demo-banner')
    expect([...banner.querySelectorAll('button')].map((btn) => btn.textContent)).toEqual(['Eigene Familie anlegen', 'Gutschein anfragen'])
    expect(container.querySelector('dialog').open).toBe(false)

    await act(async () => button('Gutschein anfragen').click())

    const dialog = container.querySelector('dialog')
    expect(dialog.open).toBe(true)
    expect(dialog.querySelector('#modal-title').textContent).toBe('Gutschein anfragen')
    expect(dialog.querySelector('.request-why h3').textContent).toBe('Warum per Gutschein?')
    expect(dialog.querySelector('#demo-request-voucher-email')).not.toBeNull()
    expect(onLeave).not.toHaveBeenCalled()
  })

  test('aus der Demo abgeschickt: geht wie jede Anfrage an den Server, danach der Dank', async () => {
    sendAnfrage.mockResolvedValue({ ok: true })
    await render()
    await act(async () => button('Gutschein anfragen').click())

    const email = container.querySelector('#demo-request-voucher-email')
    act(() => {
      nativeInputValueSetter.call(email, 'wilma@example.org')
      email.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => container.querySelector('dialog form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))

    expect(sendAnfrage).toHaveBeenCalledWith(expect.objectContaining({ typ: 'gutschein', email: 'wilma@example.org', website: '' }))
    expect(container.querySelector('dialog [role="status"]').textContent).toBe('Danke! Wir melden uns per E-Mail, sobald wieder Platz ist.')
  })

  test('Schließen hängt das Formular aus; erneutes Öffnen beginnt leer', async () => {
    await render()
    await act(async () => button('Gutschein anfragen').click())
    await act(async () => container.querySelector('dialog button[aria-label="Schließen"]').click())

    expect(container.querySelector('dialog').open).toBe(false)
    expect(container.querySelector('dialog form')).toBeNull()
  })

  test('Partner-Demo: "Partner-Zugang anfragen" öffnet das Partner-Formular', async () => {
    await render({ partnerArea: true })

    await act(async () => button('Partner-Zugang anfragen').click())

    const dialog = container.querySelector('dialog')
    expect(dialog.open).toBe(true)
    expect(dialog.querySelector('#modal-title').textContent).toBe('Partner-Zugang anfragen')
    expect(dialog.querySelector('.request-why h3').textContent).toBe('Warum anfragen?')
    expect(dialog.querySelector('#demo-request-partner-firma')).not.toBeNull()
  })
})
