import { describe, expect, test } from 'vitest'
import { DEFAULT_KARTE, KARTE, KARTE_PARAM, KARTEN, backHasCode, karteFromParams, karteRoute } from './kartenWahl.js'

describe('Karten als Kombination', () => {
  test('drei Kombinationen in fester Reihenfolge, Kombi ist die Vorgabe', () => {
    expect(KARTEN.map((karte) => [karte.id, karte.label, karte.hinten])).toEqual([
      ['visitenkarte', 'Visitenkarte', 'euer Portal'],
      ['einladung', 'Einladungskarte', 'Einladungscode'],
      ['kombi', 'Kombi', 'Portal + Einladungscode']
    ])
    expect(KARTEN.every((karte) => karte.vorne === 'Kontakte')).toBe(true)
    expect(DEFAULT_KARTE).toBe(KARTE.kombi)
    expect(KARTE_PARAM).toBe('karte')
  })

  test('backHasCode: Einladungskarte und Kombi tragen einen Code, die Visitenkarte nicht', () => {
    expect(backHasCode(KARTE.visitenkarte)).toBe(false)
    expect(backHasCode(KARTE.einladung)).toBe(true)
    expect(backHasCode(KARTE.kombi)).toBe(true)
    expect(backHasCode(undefined)).toBe(false)
  })

  test('karteFromParams: ?karte= aus der Liste, das frühere ?art=einladung wird zur Einladungskarte, sonst nichts', () => {
    expect(karteFromParams(new URLSearchParams('karte=kombi'))).toBe('kombi')
    expect(karteFromParams(new URLSearchParams('karte=visitenkarte&demo=1'))).toBe('visitenkarte')
    expect(karteFromParams(new URLSearchParams('art=einladung'))).toBe('einladung')
    expect(karteFromParams(new URLSearchParams('karte=einladung&art=visitenkarte'))).toBe('einladung')
    for (const search of ['', 'karte=gutschein', 'karte=KOMBI', 'art=visitenkarte', 'art=x']) {
      expect(karteFromParams(new URLSearchParams(search))).toBeNull()
    }
  })

  test('karteRoute: Einstieg mit vorgewählter Kombination', () => {
    expect(karteRoute('einladung')).toBe('/visitenkarten?karte=einladung')
    expect(karteRoute()).toBe('/visitenkarten')
  })
})
