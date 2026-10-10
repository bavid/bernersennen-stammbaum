import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  DISMISSED_KEY,
  MAX_DISMISSED,
  addDismissed,
  berlinToUtcIso,
  formatBerlin,
  formatZeitraum,
  hinweisClientErrors,
  initialHinweisForm,
  localizeHinweis,
  readDismissed,
  toHinweisPayload,
  utcIsoToBerlin,
  visibleHinweise,
  writeDismissed
} from './hinweise.js'

// Zeiten: Eingabe und Anzeige in Europe/Berlin, gespeichert in UTC - unabhängig von der Zeitzone des Rechners, auf dem
// die Tests (oder der Admin) laufen.
describe('Zeiten in Europe/Berlin', () => {
  test('Sommerzeit (+2) und Winterzeit (+1) nach UTC', () => {
    expect(berlinToUtcIso('2026-10-05', '22:00')).toBe('2026-10-05T20:00:00.000Z')
    expect(berlinToUtcIso('2026-12-24', '18:30')).toBe('2026-12-24T17:30:00.000Z')
    expect(berlinToUtcIso('2026-01-01', '00:00')).toBe('2025-12-31T23:00:00.000Z')
  })

  test('UTC zurück nach Berlin, auch über die Datumsgrenze', () => {
    expect(utcIsoToBerlin('2026-10-05T20:00:00.000Z')).toEqual({ date: '2026-10-05', time: '22:00' })
    expect(utcIsoToBerlin('2025-12-31T23:00:00.000Z')).toEqual({ date: '2026-01-01', time: '00:00' })
    expect(utcIsoToBerlin('2026-07-01T22:15:00.000Z')).toEqual({ date: '2026-07-02', time: '00:15' })
  })

  test('hin und zurück bleibt gleich, auch an den Tagen der Zeitumstellung', () => {
    for (const [date, time] of [
      ['2026-03-29', '01:30'],
      ['2026-03-29', '03:30'],
      ['2026-10-25', '01:30'],
      ['2026-10-25', '04:00'],
      ['2026-06-15', '12:00']
    ]) {
      expect(utcIsoToBerlin(berlinToUtcIso(date, time))).toEqual({ date, time })
    }
  })

  test('ungültige Eingaben ergeben null', () => {
    expect(berlinToUtcIso('', '10:00')).toBeNull()
    expect(berlinToUtcIso('2026-02-30', '10:00')).toBeNull()
    expect(berlinToUtcIso('2026-10-05', '25:00')).toBeNull()
    expect(berlinToUtcIso('2026-10-05', '')).toBeNull()
    expect(utcIsoToBerlin('kein Datum')).toBeNull()
    expect(utcIsoToBerlin(null)).toBeNull()
  })

  test('Anzeige: "5. Oktober 2026, 22:00 Uhr" und der Zeitraum', () => {
    expect(formatBerlin('2026-10-05T20:00:00.000Z')).toBe('5. Oktober 2026, 22:00 Uhr')
    expect(formatZeitraum({ start: '2026-10-05T20:00:00.000Z', ende: null })).toBe('ab 5. Oktober 2026, 22:00 Uhr · ohne Ende')
    expect(formatZeitraum({ start: '2026-10-05T20:00:00.000Z', ende: '2026-10-05T23:30:00.000Z' })).toBe(
      '5. Oktober 2026, 22:00 Uhr – 6. Oktober 2026, 01:30 Uhr'
    )
    expect(formatZeitraum({ start: '2026-10-05T18:00:00.000Z', ende: '2026-10-05T20:30:00.000Z' })).toBe('5. Oktober 2026, 20:00 – 22:30 Uhr')
  })
})

describe('Formular', () => {
  const NOW = new Date('2026-10-03T08:07:00.000Z')

  test('neu: jetzt als Beginn (Berliner Zeit), ohne Ende, Info, eingeschaltet', () => {
    expect(initialHinweisForm(null, NOW)).toEqual({
      titel: '',
      text: '',
      titelEn: '',
      textEn: '',
      stufe: 'info',
      startDate: '2026-10-03',
      startTime: '10:07',
      endeDate: '',
      endeTime: '',
      aktiv: true
    })
  })

  test('bearbeiten: die gespeicherten Werte in Berliner Zeit', () => {
    const hinweis = { titel: 'Wartung', text: null, stufe: 'wartung', start: '2026-10-05T20:00:00.000Z', ende: '2026-10-05T23:30:00.000Z', aktiv: false }
    expect(initialHinweisForm(hinweis, NOW)).toEqual({
      titel: 'Wartung',
      text: '',
      titelEn: '',
      textEn: '',
      stufe: 'wartung',
      startDate: '2026-10-05',
      startTime: '22:00',
      endeDate: '2026-10-06',
      endeTime: '01:30',
      aktiv: false
    })
  })

  test('Payload: Zeiten in UTC, leeres Ende als null, Text getrimmt oder null', () => {
    const form = { ...initialHinweisForm(null, NOW), titel: ' Wartung ', text: '  ', startDate: '2026-10-05', startTime: '22:00' }
    expect(toHinweisPayload(form)).toEqual({
      titel: 'Wartung',
      text: null,
      titelEn: null,
      textEn: null,
      stufe: 'info',
      start: '2026-10-05T20:00:00.000Z',
      ende: null,
      aktiv: true
    })
    expect(toHinweisPayload({ ...form, endeDate: '2026-10-06', endeTime: '01:30' }).ende).toBe('2026-10-05T23:30:00.000Z')
  })

  test('Fehler vor dem Absenden: Titel, Beginn, unvollständiges oder zu frühes Ende', () => {
    const ok = { ...initialHinweisForm(null, NOW), titel: 'T' }
    expect(hinweisClientErrors(ok)).toEqual({})
    expect(hinweisClientErrors({ ...ok, titel: '  ' })).toEqual({ titel: 'Bitte gib einen Titel an.' })
    expect(hinweisClientErrors({ ...ok, startTime: '' })).toEqual({ start: 'Bitte Datum und Uhrzeit des Beginns angeben.' })
    expect(hinweisClientErrors({ ...ok, endeDate: '2026-10-06' })).toEqual({ ende: 'Bitte zum Ende auch eine Uhrzeit angeben – oder beides leer lassen.' })
    expect(hinweisClientErrors({ ...ok, endeDate: '2026-10-03', endeTime: '10:07' })).toEqual({ ende: 'Das Ende muss nach dem Beginn liegen.' })
  })
})

describe('Englische Fassung (optional)', () => {
  const hinweis = { id: 1, titel: 'Willkommen', text: 'Hallo', titelEn: 'Welcome', textEn: 'Hello', stufe: 'info' }

  test('auf Englisch mit englischer Fassung: Titel und Text englisch', () => {
    expect(localizeHinweis(hinweis, 'en')).toMatchObject({ titel: 'Welcome', text: 'Hello' })
  })

  test('auf Deutsch oder ohne englische Fassung bleibt es deutsch', () => {
    expect(localizeHinweis(hinweis, 'de')).toBe(hinweis)
    const nurDeutsch = { ...hinweis, titelEn: null, textEn: null }
    expect(localizeHinweis(nurDeutsch, 'en')).toBe(nurDeutsch)
  })

  test('Formular: englischer Text braucht einen englischen Titel', () => {
    const form = { ...initialHinweisForm(null), titel: 'T', textEn: 'Hello' }
    expect(hinweisClientErrors(form)).toEqual({ titelEn: 'Zum englischen Text gehört auch ein englischer Titel.' })
    expect(toHinweisPayload({ ...form, titelEn: ' Hi ' })).toMatchObject({ titelEn: 'Hi', textEn: 'Hello' })
  })
})

describe('Weggeklickte Hinweise (sessionStorage)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    globalThis.sessionStorage?.clear?.()
  })

  test('lesen und schreiben über einen eigenen Schlüssel, nur Zahlen zählen', () => {
    const store = new Map()
    vi.stubGlobal('sessionStorage', {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, value)
    })
    expect(readDismissed()).toEqual([])
    writeDismissed([3, 7])
    expect(store.get(DISMISSED_KEY)).toBe('[3,7]')
    expect(readDismissed()).toEqual([3, 7])
    store.set(DISMISSED_KEY, '[1,"x",null,4]')
    expect(readDismissed()).toEqual([1, 4])
    store.set(DISMISSED_KEY, 'kaputt')
    expect(readDismissed()).toEqual([])
    vi.unstubAllGlobals()
  })

  test('ohne Speicher (privates Fenster, gesperrt) einfach leer bzw. ohne Fehler', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      }
    })
    expect(readDismissed()).toEqual([])
    expect(() => writeDismissed([1])).not.toThrow()
    vi.unstubAllGlobals()
  })

  test('hinzufügen ohne Doppelte, gedeckelt auf die neuesten', () => {
    expect(addDismissed([1, 2], 2)).toEqual([1, 2])
    expect(addDismissed([1, 2], 3)).toEqual([1, 2, 3])
    const many = Array.from({ length: MAX_DISMISSED }, (_, i) => i + 1)
    const next = addDismissed(many, 999)
    expect(next).toHaveLength(MAX_DISMISSED)
    expect(next.at(-1)).toBe(999)
    expect(next[0]).toBe(2)
  })

  test('sichtbar: alles außer den weggeklickten - ein neuer Hinweis erscheint trotzdem', () => {
    const list = [{ id: 5 }, { id: 4 }, { id: 3 }]
    expect(visibleHinweise(list, [4])).toEqual([{ id: 5 }, { id: 3 }])
    expect(visibleHinweise([{ id: 6 }, ...list], [5, 4, 3])).toEqual([{ id: 6 }])
    expect(visibleHinweise(null, [])).toEqual([])
  })
})
