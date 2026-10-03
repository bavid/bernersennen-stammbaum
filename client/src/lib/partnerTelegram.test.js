import { describe, expect, test } from 'vitest'
import { HINWEIS_OPTIONS, isTelegramLink, telegramStatus } from './partnerTelegram.js'

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
  test('echte Booleans; Schalter nur, solange verbunden; getrennt nur "blockiert"', () => {
    expect(telegramStatus({ eingerichtet: true, verbunden: true, getrennt: null, hinweise: { nachricht: true, freigabe: false } })).toEqual({
      eingerichtet: true,
      verbunden: true,
      getrennt: null,
      hinweise: { nachricht: true, freigabe: false }
    })
    expect(telegramStatus({ eingerichtet: true, verbunden: false, getrennt: 'blockiert', hinweise: { nachricht: true } })).toEqual({
      eingerichtet: true,
      verbunden: false,
      getrennt: 'blockiert',
      hinweise: { nachricht: false, freigabe: false }
    })
    expect(telegramStatus({ eingerichtet: 'ja', verbunden: 1, getrennt: 'egal' }).eingerichtet).toBe(false)
    expect(telegramStatus(null).verbunden).toBe(false)
  })

  test('zwei Schalter mit den Schlüsseln des Servers', () => {
    expect(HINWEIS_OPTIONS.map((option) => option.key)).toEqual(['nachricht', 'freigabe'])
  })
})
