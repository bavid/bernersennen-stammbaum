// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { telegram, connectTelegram, checkTelegram, updateTelegramHinweise, sendTelegramTest, disconnectTelegram } = vi.hoisted(() => ({
  telegram: vi.fn(),
  connectTelegram: vi.fn(),
  checkTelegram: vi.fn(),
  updateTelegramHinweise: vi.fn(),
  sendTelegramTest: vi.fn(),
  disconnectTelegram: vi.fn()
}))
vi.mock('../api', () => ({
  api: { partnerArea: { telegram, connectTelegram, checkTelegram, updateTelegramHinweise, sendTelegramTest, disconnectTelegram } }
}))

import PartnerTelegramSection from './PartnerTelegramSection.jsx'
import { DemoProvider } from '../lib/demo.js'
import { POLL_INTERVAL_MS } from '../lib/partnerTelegram.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const LINK = { url: 'https://t.me/pfoten_hinweis_bot?start=AbCdEfGhIjKlMnOpQrStUv', gueltigMinuten: 15 }
const notConnected = { eingerichtet: true, verbunden: false, getrennt: null, hinweise: { nachricht: false, freigabe: false } }
const connected = { eingerichtet: true, verbunden: true, getrennt: null, hinweise: { nachricht: true, freigabe: true } }

let container
let root

beforeEach(() => {
  // jsdom kennt <dialog>.showModal nicht.
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close() {
    this.open = false
  }
})

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  vi.useRealTimers()
  for (const mock of [telegram, connectTelegram, checkTelegram, updateTelegramHinweise, sendTelegramTest, disconnectTelegram]) mock.mockReset()
})

async function render(status, { isDemo = false } = {}) {
  telegram.mockResolvedValue(status)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <DemoProvider value={isDemo}>
        <PartnerTelegramSection />
      </DemoProvider>
    )
  )
}

function button(text) {
  return [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim() === text)
}

describe('PartnerTelegramSection', () => {
  test('ohne Bot im Admin: "noch nicht eingerichtet", kein Knopf', async () => {
    await render({ eingerichtet: false, verbunden: false, getrennt: null, hinweise: {} })
    expect(container.querySelector('h2').textContent).toBe('Benachrichtigungen')
    expect(container.textContent).toContain('Telegram ist noch nicht eingerichtet.')
    expect(button('Mit Telegram verbinden')).toBeUndefined()
  })

  test('nicht verbunden: Knopf mit Datenschutz-Hinweis; ein blockierter Bot wird erklärt', async () => {
    await render({ ...notConnected, getrennt: 'blockiert' })
    expect(button('Mit Telegram verbinden').disabled).toBe(false)
    expect(container.querySelector('.telegram-state.is-blocked').textContent).toContain('der Bot wurde blockiert')
    expect(container.textContent).toContain('keine Namen, Kontaktdaten oder Nachrichtentexte')
  })

  test('Verbinden: Dialog mit Link und QR-Code, fragt alle 10 s nach und schließt sich, sobald verbunden', async () => {
    vi.useFakeTimers()
    connectTelegram.mockResolvedValue(LINK)
    checkTelegram.mockResolvedValueOnce(notConnected).mockResolvedValueOnce(connected)
    await render(notConnected)
    await act(async () => button('Mit Telegram verbinden').click())

    const dialog = container.querySelector('dialog')
    expect(dialog.open).toBe(true)
    const link = dialog.querySelector('a.btn')
    expect(link.getAttribute('href')).toBe(LINK.url)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    const qr = dialog.querySelector('img.telegram-connect-qr')
    expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    expect(dialog.textContent).toContain('Der Link gilt 15 Minuten und nur einmal.')
    expect(dialog.querySelector('[role="status"]').textContent).toBe('Warte auf die Bestätigung in Telegram …')

    await act(async () => vi.advanceTimersByTime(POLL_INTERVAL_MS))
    expect(checkTelegram).toHaveBeenCalledTimes(1)
    expect(container.querySelector('dialog')).not.toBeNull()
    await act(async () => vi.advanceTimersByTime(POLL_INTERVAL_MS))
    expect(checkTelegram).toHaveBeenCalledTimes(2)
    expect(container.querySelector('dialog')).toBeNull()
    expect(container.textContent).toContain('Mit Telegram verbunden')

    await act(async () => vi.advanceTimersByTime(POLL_INTERVAL_MS * 3))
    expect(checkTelegram).toHaveBeenCalledTimes(2, 'nach dem Schließen keine Abfragen mehr')
  })

  test('"Verbindung prüfen" fragt sofort; ein Fehler steht im Status; Schließen beendet das Nachfragen', async () => {
    vi.useFakeTimers()
    connectTelegram.mockResolvedValue(LINK)
    checkTelegram.mockRejectedValue(new Error('Telegram ist gerade nicht erreichbar – bitte gleich noch einmal versuchen.'))
    await render(notConnected)
    await act(async () => button('Mit Telegram verbinden').click())
    await act(async () => button('Verbindung prüfen').click())
    expect(checkTelegram).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.telegram-connect-status').textContent).toMatch(/nicht erreichbar/)
    await act(async () => container.querySelector('dialog button[aria-label="Schließen"]').click())
    expect(container.querySelector('dialog')).toBeNull()
    await act(async () => vi.advanceTimersByTime(POLL_INTERVAL_MS * 2))
    expect(checkTelegram).toHaveBeenCalledTimes(1)
  })

  test('verbunden: Schalter speichern sofort, Testnachricht, Trennen nach Bestätigung', async () => {
    updateTelegramHinweise.mockResolvedValue({ ...connected, hinweise: { nachricht: false, freigabe: true } })
    sendTelegramTest.mockResolvedValue({ ok: true })
    disconnectTelegram.mockResolvedValue(notConnected)
    await render(connected)

    const boxes = [...container.querySelectorAll('.telegram-hinweise input[type="checkbox"]')]
    expect(boxes.map((box) => box.checked)).toEqual([true, true])
    expect(container.querySelector('.telegram-hinweise').textContent).toContain('Neue Nachricht über ‚Schreib uns‘')
    await act(async () => boxes[0].click())
    expect(updateTelegramHinweise).toHaveBeenCalledWith({ nachricht: false })
    expect(container.querySelectorAll('.telegram-hinweise input')[0].checked).toBe(false)

    await act(async () => button('Testnachricht senden').click())
    expect(sendTelegramTest).toHaveBeenCalledTimes(1)

    const trennen = container.querySelector('.telegram-actions .btn-danger')
    await act(async () => trennen.click())
    expect(disconnectTelegram).not.toHaveBeenCalled()
    await act(async () => trennen.click())
    expect(disconnectTelegram).toHaveBeenCalledTimes(1)
    expect(button('Mit Telegram verbinden')).not.toBeUndefined()
  })

  test('Testnachricht an einen blockierten Bot (409): Meldung und neuer Status vom Server', async () => {
    const blocked = { ...notConnected, getrennt: 'blockiert' }
    sendTelegramTest.mockRejectedValue(Object.assign(new Error('Telegram meldet, dass der Bot blockiert ist.'), { status: 409 }))
    await render(connected)
    telegram.mockResolvedValue(blocked)
    await act(async () => button('Testnachricht senden').click())
    expect(container.querySelector('.telegram-state.is-blocked')).not.toBeNull()
  })

  test('Demo: alles sichtbar, nichts änderbar', async () => {
    await render(connected, { isDemo: true })
    expect([...container.querySelectorAll('.telegram-hinweise input')].every((box) => box.disabled)).toBe(true)
    expect(button('Testnachricht senden').disabled).toBe(true)
    expect(container.querySelector('.telegram-actions .btn-danger').disabled).toBe(true)
    expect(container.textContent).toContain('In der Demo nicht möglich.')
    act(() => root.unmount())
    root = null
    container.remove()
    await render(notConnected, { isDemo: true })
    expect(button('Mit Telegram verbinden').disabled).toBe(true)
  })
})
