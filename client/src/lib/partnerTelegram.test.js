import { describe, expect, test } from 'vitest'
import { HINWEIS_OPTIONS, hasOwnBot, isBotToken, isTelegramLink, telegramStatus } from './partnerTelegram.js'

describe('isTelegramLink', () => {
  test('nur https://t.me/<bot>?start=<code>', () => {
    expect(isTelegramLink('https://t.me/pfoten_hinweis_bot?start=AbCdEfGhIjKlMnOpQrStUv')).toBe(true)
    for (const url of [
      'http://t.me/pfoten_hinweis_bot?start=AbCdEfGhIjKlMnOpQrStUv',
      'https://t.me.example.org/bot?start=AbCdEfGhIjKlMnOpQrStUv',
      'https://t.me/pfoten_hinweis_bot?start=kurz',
      'https://t.me/pfoten_hinweis_bot?start=AbCdEfGhIjKlMnOpQrStUv&x=1',
      'javascript:alert(1)',
      null
    ]) {
      expect(isTelegramLink(url)).toBe(false)
    }
  })
})

describe('telegramStatus', () => {
  test('echte Booleans; Schalter nur, solange verbunden; getrennt nur "blockiert" oder "bot-gewechselt"', () => {
    expect(telegramStatus({ eingerichtet: true, verbunden: true, getrennt: null, hinweise: { nachricht: true, freigabe: false } })).toEqual({
      eingerichtet: true,
      verbunden: true,
      getrennt: null,
      hinweise: { nachricht: true, freigabe: false },
      bot: null
    })
    expect(telegramStatus({ eingerichtet: true, verbunden: false, getrennt: 'blockiert', hinweise: { nachricht: true } })).toEqual({
      eingerichtet: true,
      verbunden: false,
      getrennt: 'blockiert',
      hinweise: { nachricht: false, freigabe: false },
      bot: null
    })
    expect(telegramStatus({ eingerichtet: true, verbunden: false, getrennt: 'bot-gewechselt' }).getrennt).toBe('bot-gewechselt')
    expect(telegramStatus({ eingerichtet: true, verbunden: true, getrennt: 'bot-gewechselt' }).getrennt).toBe(null)
    expect(telegramStatus({ eingerichtet: 'ja', verbunden: 1, getrennt: 'egal' }).eingerichtet).toBe(false)
    expect(telegramStatus(null).verbunden).toBe(false)
  })

  test('bot: eigener Bot mit Namen im Telegram-Format, Team-Bot ohne Namen, alles andere null', () => {
    expect(telegramStatus({ eingerichtet: true, bot: { quelle: 'eigener', username: 'lindenhof_bot' } }).bot).toEqual({ quelle: 'eigener', username: 'lindenhof_bot' })
    expect(telegramStatus({ eingerichtet: true, bot: { quelle: 'eigener', username: '<script>' } }).bot).toEqual({ quelle: 'eigener', username: null })
    expect(telegramStatus({ eingerichtet: true, bot: { quelle: 'plattform', username: 'egal_bot' } }).bot).toEqual({ quelle: 'plattform', username: null })
    expect(telegramStatus({ eingerichtet: true, bot: { quelle: 'fremd' } }).bot).toBe(null)
    expect(hasOwnBot(telegramStatus({ bot: { quelle: 'eigener', username: 'lindenhof_bot' } }))).toBe(true)
    expect(hasOwnBot(telegramStatus({ bot: { quelle: 'plattform' } }))).toBe(false)
  })

  test('isBotToken: Zahl, Doppelpunkt, mindestens 30 Zeichen', () => {
    expect(isBotToken(' 123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcd-_ ')).toBe(true)
    expect(isBotToken('123456:kurz')).toBe(false)
    expect(isBotToken('kein-token')).toBe(false)
    expect(isBotToken(null)).toBe(false)
  })

  test('zwei Schalter mit den Schlüsseln des Servers', () => {
    expect(HINWEIS_OPTIONS.map((option) => option.key)).toEqual(['nachricht', 'freigabe'])
  })
})
