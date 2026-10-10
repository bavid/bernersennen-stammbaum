import { afterEach, describe, expect, test } from 'vitest'
import { bandLabel, followerZeile, istOeffentlich, kannEinschalten, kannOeffentlich, ortZeile, profilPath, revierStand } from './revier.js'
import { setLang } from './i18n/index.js'

afterEach(() => setLang('de'))

describe('Mein Revier – Hilfen', () => {
  test('Stufen statt Kilometer, Ort nur wenn gezeigt', () => {
    expect(bandLabel('unter5')).toBe('unter 5 km')
    expect(bandLabel('10-25')).toBe('10–25 km')
    expect(bandLabel('irgendwas')).toBe('')
    expect(ortZeile({ band: '5-10' })).toBe('5–10 km')
    expect(ortZeile({ band: '5-10', ort: 'Hamburg' })).toBe('5–10 km · Hamburg')
    expect(profilPath('ab c')).toBe('/revier/ab%20c')
  })

  test('Folgende: privat nur die Zahl, öffentlich die Namen', () => {
    expect(followerZeile({ anzahl: 0 })).toBe('Noch niemand folgt')
    expect(followerZeile({ anzahl: 3 })).toBe('3 Folgende')
    expect(followerZeile({ anzahl: 3, namen: ['Benno vom Spadenland'], weitere: 2 })).toBe('3 Folgende: Benno vom Spadenland und 2 weitere')
    expect(followerZeile({ anzahl: 1, namen: ['Lotte & Minka'], weitere: 0 })).toBe('1 Folgende:r: Lotte & Minka')
  })

  test('Einschalten nur mit PLZ und Häkchen', () => {
    expect(kannEinschalten({ plz: '21037', zustimmung: true })).toBe(true)
    expect(kannEinschalten({ plz: '2103', zustimmung: true })).toBe(false)
    expect(kannEinschalten({ plz: '21037', zustimmung: false })).toBe(false)
  })

  test('öffentlich nur markiert, nicht privat, ohne Gesundheit, Tier im Profil', () => {
    const markiert = new Set([1, 2, 3])
    const tiere = new Set([10])
    expect(istOeffentlich({ id: 1, dog_id: 10, privat: 0 }, markiert, tiere)).toBe(true)
    expect(istOeffentlich({ id: 2, dog_id: 10, privat: 1 }, markiert, tiere)).toBe(false)
    expect(istOeffentlich({ id: 3, dog_id: 10, privat: 0, gesundheit: { art: 'impfung' } }, markiert, tiere)).toBe(false)
    expect(istOeffentlich({ id: 1, dog_id: 11, privat: 0 }, markiert, tiere)).toBe(false)
    expect(kannOeffentlich({ privat: 0, gesundheit: null })).toBe(true)
    expect(kannOeffentlich({ privat: 0, gesundheit: { art: 'tierarzt' } })).toBe(false)
  })

  test('Stand aus „Wer sieht was“ - ohne Profil leer', () => {
    expect(revierStand(null)).toEqual({ vorhanden: false, aktiv: false, tiere: new Set(), markiert: new Set() })
    const stand = revierStand({ settings: { aktiv: true, gesperrt: false, tiere: [{ id: 10, sichtbar: true }, { id: 11, sichtbar: false }] }, markiert: [5] })
    expect(stand.aktiv).toBe(true)
    expect([...stand.tiere]).toEqual([10])
    expect(stand.markiert.has(5)).toBe(true)
    expect(revierStand({ settings: { aktiv: true, gesperrt: true, tiere: [] } }).aktiv).toBe(false)
  })

  test('Englisch', () => {
    setLang('en')
    expect(bandLabel('unter5')).toBe('under 5 km')
    expect(followerZeile({ anzahl: 2 })).toBe('2 followers')
  })
})
