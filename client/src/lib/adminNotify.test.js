import { describe, expect, test } from 'vitest'
import { EVENT_SWITCHES, TELEGRAM_UNREACHABLE_MESSAGE, canRemoveTelegram, chatLabel, notifyErrorMessage } from './adminNotify.js'

function apiError(message, status) {
  return Object.assign(new Error(message), { status })
}

describe('adminNotify', () => {
  test('ein Schalter je Ereignis in der Reihenfolge des Servers', () => {
    expect(EVENT_SWITCHES.map((item) => item.key)).toEqual(['gutschein_anfrage', 'partner_anfrage', 'registrierung', 'feedback', 'beitrag', 'server_warnung'])
  })

  test('chatLabel: Titel mit Art auf Deutsch', () => {
    expect(chatLabel({ id: '42', titel: 'Wilma', typ: 'private' })).toBe('Wilma (privat)')
    expect(chatLabel({ id: '-100', titel: 'Team Pfoten', typ: 'supergroup' })).toBe('Team Pfoten (Gruppe)')
    expect(chatLabel({ id: '7', titel: 'Chat', typ: null })).toBe('Chat')
  })

  test('502 ohne eigene Meldung: "Telegram ist gerade nicht erreichbar."; sonst die Meldung des Servers', () => {
    expect(notifyErrorMessage(apiError('Fehler 502', 502))).toBe(TELEGRAM_UNREACHABLE_MESSAGE)
    expect(TELEGRAM_UNREACHABLE_MESSAGE).toBe('Telegram ist gerade nicht erreichbar.')
    expect(notifyErrorMessage(apiError('Die Testnachricht ist nicht angekommen – bitte Bot-Token und Chat-ID prüfen.', 502))).toBe(
      'Die Testnachricht ist nicht angekommen – bitte Bot-Token und Chat-ID prüfen.'
    )
    expect(notifyErrorMessage(apiError('Der Bot-Token wurde von Telegram nicht akzeptiert.', 400))).toBe(
      'Der Bot-Token wurde von Telegram nicht akzeptiert.'
    )
  })

  test('canRemoveTelegram: nur bei Werten aus dem Admin', () => {
    expect(canRemoveTelegram({ eingerichtet: true, quelle: 'admin', tokenHinweis: '…abcd', chatId: '42' })).toBe(true)
    expect(canRemoveTelegram({ eingerichtet: false, quelle: null, tokenHinweis: '…abcd', chatId: null })).toBe(true)
    expect(canRemoveTelegram({ eingerichtet: true, quelle: 'umgebung', tokenHinweis: '…abcd', chatId: '42' })).toBe(false)
    expect(canRemoveTelegram({ eingerichtet: false, quelle: null, tokenHinweis: null, chatId: null })).toBe(false)
  })
})
