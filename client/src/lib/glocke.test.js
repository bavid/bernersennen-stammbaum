import { describe, expect, test } from 'vitest'
import {
  badgeText,
  bellLabel,
  greetingText,
  guestText,
  hinweisGroups,
  hinweisItems,
  hinweisTotal,
  hinweisZahlen,
  requestText,
  startLineText,
  withHinweisZahlen
} from './glocke.js'

describe('Hinweis-Glocke: Zahlen', () => {
  test('hinweisZahlen liest die Zahlen aus /me - Unsinn zählt als 0', () => {
    expect(hinweisZahlen({ erlebtMitOffen: 2, neueGaeste: 1, neueGruesse: 3 })).toEqual({ anfragen: 2, gaeste: 1, gruesse: 3 })
    expect(hinweisZahlen({ erlebtMitOffen: -1, neueGaeste: '2' })).toEqual({ anfragen: 0, gaeste: 0, gruesse: 0 })
    expect(hinweisZahlen(null)).toEqual({ anfragen: 0, gaeste: 0, gruesse: 0 })
    expect(hinweisTotal({ anfragen: 2, gaeste: 1, gruesse: 3 })).toBe(6)
  })

  test('withHinweisZahlen: neue family nur bei einer Änderung', () => {
    const family = { id: 1, erlebtMitOffen: 1, neueGaeste: 0, neueGruesse: 2 }
    expect(withHinweisZahlen(family, { anfragen: 1, gaeste: 0, gruesse: 2 })).toBe(family)
    expect(withHinweisZahlen(family, { anfragen: 0, gaeste: 0, gruesse: 2 })).toEqual({ ...family, erlebtMitOffen: 0 })
    expect(withHinweisZahlen(null, { anfragen: 1, gaeste: 0, gruesse: 0 })).toBeNull()
  })

  test('Beschriftungen: Knopf, Badge, Zeile auf Start', () => {
    expect(bellLabel(0)).toBe('Hinweise')
    expect(bellLabel(2)).toBe('Hinweise, 2 neu')
    expect(badgeText(3)).toBe('3')
    expect(badgeText(120)).toBe('99+')
    expect(startLineText(1)).toBe('1 neuer Hinweis')
    expect(startLineText(4)).toBe('4 neue Hinweise')
  })
})

describe('Hinweis-Glocke: Liste', () => {
  const anfrage = { requestId: 5, angefragtAm: '2026-10-03 10:00:00', dogName: 'Wilma', titel: 'Strandtag', zuhause: 'Zuhause Möwenweg', zuhauseId: 8 }
  const gast = { id: 9, name: 'Zuhause Heidekamp', seit: '2026-10-04 08:00:00', neu: true }
  const alterGast = { id: 10, name: 'Zuhause Alt', seit: '2026-01-01 08:00:00', neu: false }
  const gruss = { id: 3, entryId: 12, dogId: 4, titel: 'Erster Schnee', von: 'Familie Sonnenhang', createdAt: '2026-10-02 09:00:00', neu: true }
  const alterGruss = { ...gruss, id: 2, createdAt: '2026-09-20 09:00:00', neu: false }

  test('Texte: Frage, neuer Gast, Gruß', () => {
    expect(requestText(anfrage)).toBe('Wilma war beim „Strandtag“ mit dabei?')
    expect(guestText(gast)).toBe('Neu bei euch zu Gast: Zuhause Heidekamp')
    expect(greetingText(gruss)).toBe('Familie Sonnenhang hat euch zu „Erster Schnee“ gegrüßt')
  })

  test('hinweisItems: neueste zuerst, nur neue Gäste, Grüße mit neu', () => {
    const items = hinweisItems({ anfragen: [anfrage], gaeste: [gast, alterGast], gruesse: [gruss, alterGruss] })
    expect(items.map((item) => item.key)).toEqual(['gast-9', 'anfrage-5', 'gruss-3', 'gruss-2'])
    expect(items.map((item) => item.neu)).toEqual([true, true, true, false])
  })

  test('hinweisGroups: „Neu“ und „Früher“ nur, wenn es beides gibt', () => {
    const items = hinweisItems({ anfragen: [anfrage], gaeste: [], gruesse: [gruss, alterGruss] })
    const groups = hinweisGroups(items)
    expect(groups.map((group) => [group.label, group.items.length])).toEqual([
      ['Neu', 2],
      ['Früher', 1]
    ])
    const onlyNew = hinweisGroups(hinweisItems({ anfragen: [anfrage], gaeste: [], gruesse: [] }))
    expect(onlyNew.map((group) => [group.label, group.items.length])).toEqual([[null, 1]])
    expect(hinweisGroups([])).toEqual([])
  })
})
