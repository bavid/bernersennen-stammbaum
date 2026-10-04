import { describe, expect, test } from 'vitest'
import {
  DEFAULT_OPTIONEN,
  altText,
  captionFor,
  cleanAuswahl,
  cleanOptionen,
  diffOptionen,
  firstFramePhoto,
  fotoKey,
  formatClock,
  heuteVorText,
  isNight,
  orderFotos,
  yearsAgo
} from './bilderrahmen.js'

const today = new Date(2026, 9, 4, 14, 5) // So, 4. Oktober 2026, 14:05 (lokal)
const foto = (url, datum, extra = {}) => ({ url, tierName: 'Nele', datum, inErinnerung: false, ...extra })

describe('Bilderrahmen: Optionen', () => {
  test('ungültige oder fehlende Werte fallen auf die Vorgabe zurück', () => {
    expect(cleanOptionen(null)).toEqual(DEFAULT_OPTIONEN)
    expect(cleanOptionen({ intervall: 7, uhr: 'ja', nacht: false, fremd: 1 })).toEqual({ ...DEFAULT_OPTIONEN, nacht: false })
    expect(cleanOptionen({ intervall: 60 }).intervall).toBe(60)
  })

  test('Auswahl: nur Zahlen-Ids und bekannte Zeiträume', () => {
    expect(cleanAuswahl({ tiere: [3, 'x', 3, -1], zeitraum: 'jahr' })).toEqual({ tiere: [3], zeitraum: 'jahr', privat: false })
    expect(cleanAuswahl({ zeitraum: 'woche', privat: 'ja' })).toEqual({ tiere: [], zeitraum: 'alle', privat: false })
    expect(cleanAuswahl({ privat: true }).privat).toBe(true)
  })

  test('diffOptionen merkt sich nur, was vom Rahmen-Link abweicht', () => {
    const base = { ...DEFAULT_OPTIONEN, intervall: 30 }
    expect(diffOptionen({ ...base, uhr: true }, base)).toEqual({ uhr: true })
    expect(diffOptionen(base, base)).toEqual({})
  })
})

describe('Bilderrahmen: Heute vor … Jahren', () => {
  test('gleicher Tag und Monat in einem früheren Jahr', () => {
    expect(yearsAgo('2023-10-04', today)).toBe(3)
    expect(yearsAgo('2025-10-04', today)).toBe(1)
    expect(yearsAgo('2026-10-04', today)).toBeNull()
    expect(yearsAgo('2023-10-05', today)).toBeNull()
    expect(yearsAgo(null, today)).toBeNull()
    expect(heuteVorText(1)).toBe('Heute vor einem Jahr')
    expect(heuteVorText(3)).toBe('Heute vor 3 Jahren')
  })

  test('Bildunterschrift: Name · Datum, Heute vor, In Erinnerung (nur wenn eingeschaltet)', () => {
    const memory = foto('/a', '2023-10-04', { inErinnerung: true })
    expect(captionFor(memory, DEFAULT_OPTIONEN, today)).toEqual({
      name: 'Nele',
      datum: '4. Oktober 2023',
      heuteVor: 'Heute vor 3 Jahren',
      erinnerung: 'In Erinnerung'
    })
    expect(captionFor(memory, { ...DEFAULT_OPTIONEN, erinnerung: false }, today).erinnerung).toBeNull()
    expect(captionFor(foto('/b', null), DEFAULT_OPTIONEN, today)).toEqual({ name: 'Nele', datum: '', heuteVor: null, erinnerung: null })
    expect(altText(foto('/c', '2024-05-12'))).toBe('Foto von Nele, 12. Mai 2024')
    expect(altText(foto('/d', null))).toBe('Foto von Nele')
  })
})

describe('Bilderrahmen: Reihenfolge', () => {
  const list = [foto('/1', '2026-09-01'), foto('/2', '2024-10-04'), foto('/3', '2025-01-01'), foto('/4', '2021-10-04'), foto('/5', null)]

  test('ohne Mischen: wie vom Server (neueste zuerst), „Heute vor“ nach vorn', () => {
    const ordered = orderFotos(list, { mischen: false, heuteZuerst: true, today })
    expect(ordered.map((f) => f.url)).toEqual(['/2', '/4', '/1', '/3', '/5'])
    expect(orderFotos(list, { mischen: false, heuteZuerst: false, today }).map((f) => f.url)).toEqual(['/1', '/2', '/3', '/4', '/5'])
  })

  test('mit Mischen: alle Fotos genau einmal, „Heute vor“ bleibt vorn', () => {
    let seed = 0.7
    const random = () => {
      seed = (seed * 9301 + 0.49297) % 1
      return seed
    }
    const ordered = orderFotos(list, { mischen: true, heuteZuerst: true, today, random })
    expect(ordered.slice(0, 2).map((f) => f.url).sort()).toEqual(['/2', '/4'])
    expect(ordered.map((f) => f.url).sort()).toEqual(['/1', '/2', '/3', '/4', '/5'])
  })

  test('Schlüssel ohne Signatur: dieselbe Datei bleibt dasselbe Foto, auch mit neuer Adresse', () => {
    expect(fotoKey({ url: '/rahmen-foto/a.jpg?g=1&exp=1&sig=x' })).toBe('/rahmen-foto/a.jpg')
    expect(fotoKey({ url: '/uploads/a.jpg' })).toBe('/uploads/a.jpg')
  })
})

describe('Bilderrahmen: Uhr und Nacht', () => {
  test('Uhrzeit und Datum auf Deutsch', () => {
    expect(formatClock(today)).toEqual({ time: '14:05', date: 'Sonntag, 4. Oktober' })
  })

  test('nachts dunkler von 22 bis 7 Uhr', () => {
    expect(isNight(new Date(2026, 9, 4, 21, 59))).toBe(false)
    expect(isNight(new Date(2026, 9, 4, 22, 0))).toBe(true)
    expect(isNight(new Date(2026, 9, 5, 6, 59))).toBe(true)
    expect(isNight(new Date(2026, 9, 5, 7, 0))).toBe(false)
  })
})

describe('Bilderrahmen: Karte auf Start', () => {
  test('erstes Tierfoto, sonst das erste Foto einer Erinnerung, sonst keins', () => {
    expect(firstFramePhoto([{ foto_url: null }, { foto_url: '/uploads/t.jpg' }], [{ foto_urls: ['/uploads/e.jpg'] }])).toBe('/uploads/t.jpg')
    expect(firstFramePhoto([{ foto_url: null }], [{ foto_urls: [] }, { foto_urls: ['/uploads/e.jpg'] }])).toBe('/uploads/e.jpg')
    expect(firstFramePhoto(null, null)).toBeNull()
  })
})
