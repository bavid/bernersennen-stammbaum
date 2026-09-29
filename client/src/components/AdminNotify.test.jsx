// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { notifySettings, updateNotifySettings, saveTelegram, findTelegramChats, sendNotifyTest } = vi.hoisted(() => ({
  notifySettings: vi.fn(),
  updateNotifySettings: vi.fn(),
  saveTelegram: vi.fn(),
  findTelegramChats: vi.fn(),
  sendNotifyTest: vi.fn()
}))
vi.mock('../api', () => ({ api: { admin: { notifySettings, updateNotifySettings, saveTelegram, findTelegramChats, sendNotifyTest } } }))

import AdminNotify from './AdminNotify.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Offensichtlich erfundener Token im erwarteten Format (Zahl, Doppelpunkt, mindestens 30 Zeichen) - nie ein echter.
const FAKE_TOKEN = '123456:TEST-TOKEN-xxxxxxxxxxxxxxxxxxxxxxxxxxxx'

const EINSTELLUNGEN = { gutschein_anfrage: true, partner_anfrage: true, registrierung: true, feedback: true, beitrag: false, details: false }
const leer = { eingerichtet: false, quelle: null, tokenHinweis: null, chatId: null, einstellungen: EINSTELLUNGEN }
const mitToken = { ...leer, tokenHinweis: '…xxxx' }
const eingerichtet = { ...mitToken, eingerichtet: true, quelle: 'admin', chatId: '424242' }

let container
let root

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

function type(element, value) {
  act(() => {
    nativeInputValueSetter.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function apiError(message, status) {
  return Object.assign(new Error(message), { status })
}

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  for (const mock of [notifySettings, updateNotifySettings, saveTelegram, findTelegramChats, sendNotifyTest]) mock.mockReset()
})

async function render(settings = leer) {
  notifySettings.mockResolvedValue(settings)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<AdminNotify />))
  return container
}

const button = (label) => [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim() === label)
const tokenInput = () => container.querySelector('#admin-notify-token')
const chatInput = () => container.querySelector('#admin-notify-chat-id')
const submitForm = (input) => act(async () => input.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))

describe('AdminNotify – Status und Schritte', () => {
  test('nicht eingerichtet: Status, fünf Schritte, Testnachricht gesperrt, kein "Entfernen"', async () => {
    await render()

    expect(container.querySelector('h2').textContent).toBe('Benachrichtigungen (Telegram)')
    expect(container.querySelector('.admin-notify-status').textContent).toBe('Noch nicht eingerichtet')
    const steps = [...container.querySelectorAll('.admin-notify-steps > li h3')].map((h) => h.textContent)
    expect(steps).toEqual(['Bot anlegen', 'Token speichern', 'Bot starten', 'Chat wählen', 'Testen'])
    expect(container.textContent).toContain('@BotFather')
    expect(container.textContent).toContain('„/newbot“')
    expect(container.textContent).toContain('„/start“')
    expect(tokenInput().getAttribute('type')).toBe('password')
    expect(tokenInput().getAttribute('autocomplete')).toBe('off')
    expect(button('Testnachricht senden').disabled).toBe(true)
    expect(button('Telegram entfernen')).toBeUndefined()
  })

  test('eingerichtet: Haken mit Quelle; aus der Server-Umgebung ohne "Entfernen"', async () => {
    await render(eingerichtet)
    expect(container.querySelector('.admin-notify-status').textContent).toBe('Eingerichtet (Quelle: Admin)')
    expect(button('Telegram entfernen')).not.toBeUndefined()

    act(() => root.unmount())
    container.remove()
    await render({ ...eingerichtet, quelle: 'umgebung' })
    expect(container.querySelector('.admin-notify-status').textContent).toBe('Eingerichtet (Quelle: Server-Umgebung)')
    expect(button('Telegram entfernen')).toBeUndefined()
  })
})

describe('AdminNotify – Token und Chat', () => {
  test('Token speichern: danach nur der Hinweis "…xxxx", das Feld ist wieder leer', async () => {
    saveTelegram.mockResolvedValue(mitToken)
    await render()

    type(tokenInput(), `  ${FAKE_TOKEN} `)
    await submitForm(tokenInput())

    expect(saveTelegram).toHaveBeenCalledWith({ token: FAKE_TOKEN })
    expect(tokenInput().value).toBe('')
    expect(container.querySelector('#admin-notify-token-hint').textContent).toBe(
      'Gespeichert: …xxxx – der Token wird nie wieder angezeigt. Ein neuer ersetzt ihn.'
    )
    expect(container.innerHTML).not.toContain('TEST-TOKEN')
  })

  test('abgelehnter Token: Meldung des Servers am Feld, das Feld behält die Eingabe', async () => {
    saveTelegram.mockRejectedValue(apiError('Der Bot-Token wurde von Telegram nicht akzeptiert.', 400))
    await render()

    type(tokenInput(), FAKE_TOKEN)
    await submitForm(tokenInput())

    expect(container.querySelector('#admin-notify-token-error').textContent).toBe('Der Bot-Token wurde von Telegram nicht akzeptiert.')
    expect(tokenInput().value).toBe(FAKE_TOKEN)
  })

  test('Telegram nicht erreichbar (502 ohne eigene Meldung): fester Satz', async () => {
    saveTelegram.mockRejectedValue(apiError('Fehler 502', 502))
    await render()
    type(tokenInput(), FAKE_TOKEN)
    await submitForm(tokenInput())
    expect(container.querySelector('#admin-notify-token-error').textContent).toBe('Telegram ist gerade nicht erreichbar.')
  })

  test('"Chat finden" listet die Chats; ein Klick trägt die ID ein, "Speichern" übernimmt sie', async () => {
    findTelegramChats.mockResolvedValue([
      { id: '424242', titel: 'Wilma', typ: 'private' },
      { id: '-1001234', titel: 'Team Pfoten', typ: 'supergroup' }
    ])
    saveTelegram.mockResolvedValue(eingerichtet)
    await render(mitToken)

    await act(async () => button('Chat finden').click())
    expect(findTelegramChats).toHaveBeenCalledTimes(1)
    const choices = [...container.querySelectorAll('.admin-notify-chats label')]
    expect(choices.map((label) => label.textContent)).toEqual(['Wilma (privat)', 'Team Pfoten (Gruppe)'])

    await act(async () => choices[1].querySelector('input').click())
    expect(chatInput().value).toBe('-1001234')
    await act(async () => choices[0].querySelector('input').click())
    expect(chatInput().value).toBe('424242')

    await submitForm(chatInput())

    expect(saveTelegram).toHaveBeenCalledWith({ chatId: '424242' })
    expect(container.querySelector('.admin-notify-status').textContent).toBe('Eingerichtet (Quelle: Admin)')
    expect(container.querySelector('#admin-notify-chat-id-hint').textContent).toBe('Gespeichert: 424242')
    expect(button('Testnachricht senden').disabled).toBe(false)
  })

  test('Chat-ID von Hand; ohne gefundene Chats ein Hinweis auf "/start"', async () => {
    findTelegramChats.mockResolvedValue([])
    saveTelegram.mockResolvedValue({ ...eingerichtet, chatId: '@teampfoten' })
    await render(mitToken)

    await act(async () => button('Chat finden').click())
    expect(container.textContent).toContain('Keine Chats gefunden – dem Bot zuerst „/start“ schreiben, dann noch einmal suchen.')

    type(chatInput(), '@teampfoten')
    await submitForm(chatInput())
    expect(saveTelegram).toHaveBeenCalledWith({ chatId: '@teampfoten' })
  })

  test('"Chat finden" ohne Token: Meldung des Servers (409)', async () => {
    findTelegramChats.mockRejectedValue(apiError('Zuerst den Bot-Token speichern.', 409))
    await render()
    await act(async () => button('Chat finden').click())
    expect(container.querySelector('.admin-notify-chat [role="alert"]').textContent).toBe('Zuerst den Bot-Token speichern.')
  })
})

describe('AdminNotify – Testnachricht, Schalter, Entfernen', () => {
  test('Testnachricht: Senden, dann Bestätigung', async () => {
    let resolve
    sendNotifyTest.mockReturnValue(new Promise((done) => (resolve = done)))
    await render(eingerichtet)

    await act(async () => button('Testnachricht senden').click())
    expect(button('Sende …').disabled).toBe(true)

    await act(async () => resolve({ ok: true }))
    expect(container.querySelector('.admin-notify-test [role="status"]').textContent).toBe('Testnachricht verschickt – schau in Telegram nach.')
  })

  test('Testnachricht kommt nicht an (502): Meldung des Servers', async () => {
    sendNotifyTest.mockRejectedValue(apiError('Die Testnachricht ist nicht angekommen – bitte Bot-Token und Chat-ID prüfen.', 502))
    await render(eingerichtet)
    await act(async () => button('Testnachricht senden').click())
    expect(container.querySelector('.admin-notify-test [role="alert"]').textContent).toBe(
      'Die Testnachricht ist nicht angekommen – bitte Bot-Token und Chat-ID prüfen.'
    )
  })

  test('Schalter je Ereignis und "Details mitsenden" mit Datenschutz-Hinweis; ein Klick speichert genau diesen Schalter', async () => {
    updateNotifySettings.mockResolvedValue({ ...leer, einstellungen: { ...EINSTELLUNGEN, beitrag: true } })
    await render()

    const switches = [...container.querySelectorAll('.admin-notify-switches input[role="switch"]')]
    expect(switches.map((input) => input.closest('label').textContent)).toEqual([
      'Gutschein-Anfrage',
      'Partner-Anfrage',
      'Neue Registrierung',
      'Feedback',
      'Eingereichter Beitrag',
      'Details mitsenden (Name, E-Mail, Bereich)'
    ])
    expect(switches.map((input) => input.checked)).toEqual([true, true, true, true, false, false])
    const details = switches[5]
    expect(document.getElementById(details.getAttribute('aria-describedby')).textContent).toContain('an Telegram – einen externen Dienst')

    await act(async () => switches[4].click())

    expect(updateNotifySettings).toHaveBeenCalledWith({ beitrag: true })
    expect(container.querySelectorAll('.admin-notify-switches input[role="switch"]')[4].checked).toBe(true)
  })

  test('"Telegram entfernen" fragt nach und löscht Token und Chat-ID', async () => {
    saveTelegram.mockResolvedValue(leer)
    await render(eingerichtet)

    await act(async () => button('Telegram entfernen').click())
    expect(saveTelegram).not.toHaveBeenCalled()
    await act(async () => button('Wirklich entfernen?').click())

    expect(saveTelegram).toHaveBeenCalledWith({ token: '', chatId: '' })
    expect(container.querySelector('.admin-notify-status').textContent).toBe('Noch nicht eingerichtet')
    expect(chatInput().value).toBe('')
    expect(button('Telegram entfernen')).toBeUndefined()
  })

  test('ein Fehler beim Laden erscheint als Alert', async () => {
    notifySettings.mockRejectedValue(new Error('Fehler 401'))
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(<AdminNotify />))
    expect(container.querySelector('[role="alert"]').textContent).toBe('Fehler 401')
  })
})
