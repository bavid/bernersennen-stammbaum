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

describe('DemoBanner – eine schmale Zeile (Calm-down-Runde)', () => {
  test('Haushalts-Demo: „Demo · nur ansehen“ und EIN Link „Eigene Familie anlegen“ – „Gutschein anfragen“ steht auf /v', async () => {
    const onLeave = vi.fn()
    await render({ onLeave })

    const banner = container.querySelector('.demo-banner')
    expect(banner.getAttribute('role')).toBe('status')
    expect(banner.querySelector('.top-strip-tag').textContent).toBe('Demo')
    expect(banner.textContent).toContain('nur ansehen')
    expect([...banner.querySelectorAll('button')].map((btn) => btn.textContent)).toEqual(['Eigene Familie anlegen'])
    // Die Gutschein-Anfrage hat die Login-Seite im Einlöse-Modus (LoginVoucherRequest) - kein Modal mehr hier.
    expect(container.textContent).not.toContain('Gutschein anfragen')
    expect(container.querySelector('dialog')).toBeNull()

    await act(async () => button('Eigene Familie anlegen').click())
    expect(onLeave).toHaveBeenCalledTimes(1)
  })

})

describe('DemoBanner – Partner-Zugang anfragen (Phase N)', () => {
  test('Partner-Demo: „Partner-Zugang anfragen“ öffnet das Partner-Formular', async () => {
    await render({ partnerArea: true })

    await act(async () => button('Partner-Zugang anfragen').click())

    const dialog = container.querySelector('dialog')
    expect(dialog.open).toBe(true)
    expect(dialog.querySelector('#modal-title').textContent).toBe('Partner-Zugang anfragen')
    expect(dialog.querySelector('.request-why h3').textContent).toBe('Warum anfragen?')
    expect(dialog.querySelector('#demo-request-partner-firma')).not.toBeNull()
  })

  test('Schließen hängt das Formular aus; erneutes Öffnen beginnt leer', async () => {
    await render({ partnerArea: true })
    await act(async () => button('Partner-Zugang anfragen').click())
    await act(async () => container.querySelector('dialog button[aria-label="Schließen"]').click())

    expect(container.querySelector('dialog').open).toBe(false)
    expect(container.querySelector('dialog form')).toBeNull()
  })
})
