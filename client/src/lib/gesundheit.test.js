import { describe, expect, test } from 'vitest'
import { GESUNDHEIT, GESUNDHEIT_ARTEN, artLabel, baldText, gesundheitPayload, infoZeile, initialGesundheit } from './gesundheit.js'
import gesundheit from './i18n/en/gesundheit.js'
import { setLang, t } from './i18n/index.js'

function withEnglish(run) {
  setLang('en')
  try {
    return run()
  } finally {
    setLang('de')
  }
}

describe('Gesundheit leicht', () => {
  test('Formular-Werte: ohne Angabe aus, mit Angabe übernommen', () => {
    expect(initialGesundheit(null)).toEqual({ aktiv: false, art: 'impfung', naechstesAm: '' })
    expect(initialGesundheit({ gesundheit: { art: 'tierarzt', naechstesAm: null } })).toEqual({ aktiv: true, art: 'tierarzt', naechstesAm: '' })
    expect(initialGesundheit({ gesundheit: { art: 'unbekannt' } }).aktiv).toBe(false)
  })

  test('Payload: neu ohne Gesundheit nichts, entfernt -> null, sonst Art und Datum', () => {
    expect(gesundheitPayload({ aktiv: false })).toEqual({})
    expect(gesundheitPayload({ aktiv: false }, true)).toEqual({ gesundheit: null })
    expect(gesundheitPayload({ aktiv: true, art: 'impfung', naechstesAm: '' })).toEqual({ gesundheit: { art: 'impfung', naechstesAm: null } })
    expect(gesundheitPayload({ aktiv: true, art: 'wurmkur_floh', naechstesAm: '2026-11-01' })).toEqual({
      gesundheit: { art: 'wurmkur_floh', naechstesAm: '2026-11-01' }
    })
  })

  test('„Bald“-Zeilen: heute, morgen, mit Datum', () => {
    const item = { art: 'impfung', dogName: 'Benno', naechstesAm: '2026-10-10' }
    expect(baldText(item, '2026-10-10')).toBe('Heute: Impfung bei Benno')
    expect(baldText(item, '2026-10-09')).toBe('Morgen: Impfung bei Benno')
    expect(baldText({ ...item, naechstesAm: '2026-10-20' }, '2026-10-10')).toBe('Am 20. Oktober: Impfung bei Benno')
  })

  test('Zeile im Reiter Infos', () => {
    expect(infoZeile({ datum: '2026-09-05', naechstesAm: '2027-09-05' })).toBe('zuletzt am 5. September 2026 · nächstes Mal am 5. September 2027')
    expect(infoZeile({ datum: '2026-09-05', naechstesAm: null })).toBe('zuletzt am 5. September 2026')
  })

  test('Englisch: jeder Text übersetzt, Zeilen auf Englisch', () => {
    for (const [key, value] of Object.entries(gesundheit)) {
      expect(typeof value === 'string' && value.trim().length > 0, key).toBe(true)
    }
    withEnglish(() => {
      for (const text of Object.values(GESUNDHEIT)) expect(t(text), text).not.toBe(text)
      for (const art of GESUNDHEIT_ARTEN) expect(artLabel(art.value), art.value).not.toBe(art.label)
      expect(artLabel('wurmkur_floh')).toBe('Worming & fleas')
      expect(baldText({ art: 'impfung', dogName: 'Benno', naechstesAm: '2026-10-11' }, '2026-10-10')).toBe('Tomorrow: Vaccination for Benno')
      expect(infoZeile({ datum: '2026-09-05', naechstesAm: null })).toBe('last on 5 September 2026')
    })
  })
})
