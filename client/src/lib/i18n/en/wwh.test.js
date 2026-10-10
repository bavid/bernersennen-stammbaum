import { describe, expect, test } from 'vitest'
import wwh from './wwh.js'
import { setLang, t } from '../index.js'
import { WWH, checkinStatusText, wishCountText, wwhErrorText } from '../../wirWarenHierText.js'

function withEnglish(run) {
  setLang('en')
  try {
    return run()
  } finally {
    setLang('de')
  }
}

describe('Englisch: Wir waren hier', () => {
  test('Wörterbuch ohne leere oder vergessene Übersetzungen; jeder Text hat eine englische Fassung', () => {
    for (const [key, value] of Object.entries(wwh)) {
      expect(typeof value === 'string' && value.trim().length > 0, key).toBe(true)
      if (/[äöüÄÖÜß]/.test(key)) expect(value, key).not.toBe(key)
    }
    for (const text of Object.values(WWH)) expect(withEnglish(() => t(text)), text).not.toBe(text)
  })

  test('Stand, Zähler und Fehler auf Englisch', () => {
    withEnglish(() => {
      expect(checkinStatusText('offen', 'Salon Flocke')).toBe('Waiting for Salon Flocke to approve')
      expect(wishCountText(2)).toBe('2 requests waiting')
      expect(wwhErrorText({ message: 'Error 429', status: 429 })).toBe('Too many attempts right now – please try again later.')
    })
    expect(checkinStatusText('bestaetigt', 'Salon Flocke')).toBe('Von Salon Flocke freigegeben')
  })
})
