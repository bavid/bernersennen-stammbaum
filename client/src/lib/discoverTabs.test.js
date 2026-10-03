import { describe, expect, test } from 'vitest'
import { normalizeDiscover } from './discover.js'
import { ALL_TAB, DISCOVER_TABS, countItems, isSectionEmpty, limitGroups, ownSectionTab, sectionCounts, tabFromParam, tabLabel } from './discoverTabs.js'

const item = (id, extra = {}) => ({ id, kind: 'partner', ...extra })

describe('DISCOVER_TABS', () => {
  test('Alle | Hundeschulen | Salon & Betreuung | Neue Begleiter | Futter | Unterstützen', () => {
    expect(DISCOVER_TABS.map((tab) => tab.label)).toEqual(['Alle', 'Hundeschulen', 'Salon & Betreuung', 'Neue Begleiter', 'Futter', 'Unterstützen'])
    expect(tabLabel('begleiter')).toBe('Neue Begleiter')
  })
})

describe('tabFromParam', () => {
  test('bekannte Bereiche bleiben, alles andere wird "Alle"', () => {
    expect(tabFromParam('futter')).toBe('futter')
    expect(tabFromParam('alle')).toBe(ALL_TAB)
    expect(tabFromParam(null)).toBe(ALL_TAB)
    expect(tabFromParam('<script>')).toBe(ALL_TAB)
    expect(tabFromParam('constructor')).toBe(ALL_TAB)
  })
})

describe('ownSectionTab', () => {
  test('Kundensicht: der Bereich der eigenen Karte - ohne eigenen Bereich (Futter, Sonstige, unbekannt) "Alle"', () => {
    expect(ownSectionTab('hundeschule')).toBe('hundeschulen')
    expect(ownSectionTab('hundesalon')).toBe('salon')
    expect(ownSectionTab('betreuung')).toBe('salon')
    expect(ownSectionTab('tierheim')).toBe('begleiter')
    expect(ownSectionTab('vermittlung')).toBe('begleiter')
    expect(ownSectionTab('futter')).toBe(ALL_TAB)
    expect(ownSectionTab('constructor')).toBe(ALL_TAB)
    expect(ownSectionTab(undefined)).toBe(ALL_TAB)
  })
})

describe('sectionCounts', () => {
  test('zählt Karten je Bereich und die Summe unter "alle"', () => {
    const data = normalizeDiscover({
      hundeschulen: [item(1), item(2, { kind: 'promotion' })],
      salon: [item(3)],
      begleiter: { partner: [item(4)], tiere: [{ slug: 'a' }, { slug: 'b' }], promotions: [item(5)] },
      futter: [item(6), item(7)],
      unterstuetzen: {
        gofundmeClickUrl: '/r/gofundme/0',
        partnerSpenden: [{ id: 1, clickUrl: '/r/partner-spende/1' }, { id: 2, clickUrl: 'https://nicht-gezaehlt.example' }],
        promotions: [item(8)]
      }
    })
    expect(sectionCounts(data)).toEqual({ hundeschulen: 2, salon: 1, begleiter: 4, futter: 2, unterstuetzen: 3, alle: 12 })
  })

  // Phase V1: ein Partner = eine Karte - seine Anzeigen und Einblicke zählen nicht extra.
  test('Partner-Abschnitte zählen Partner (Karten), nicht die Anzeigen auf ihren Karten', () => {
    const anzeigen = [item(11, { kind: 'promotion' }), item(12, { kind: 'promotion' }), item(13, { kind: 'promotion' })]
    const data = normalizeDiscover({
      hundeschulen: [item(1, { anzeigen, einblicke: [{ id: 1 }, { id: 2 }] }), item(2)],
      salon: [item(3, { anzeigen: anzeigen.slice(0, 2) })],
      begleiter: { partner: [item(4, { anzeigen: anzeigen.slice(0, 1) })], tiere: [], promotions: [] }
    })
    expect(sectionCounts(data)).toMatchObject({ hundeschulen: 2, salon: 1, begleiter: 1 })
  })

  test('Unterstützen zählt den Transparenzbericht mit', () => {
    const data = normalizeDiscover({ unterstuetzen: { bericht: { zeitraum: '2026 Q3' } } })
    expect(sectionCounts(data).unterstuetzen).toBe(1)
  })

  test('eine leere Antwort zählt überall 0', () => {
    expect(sectionCounts(normalizeDiscover({}))).toEqual({ hundeschulen: 0, salon: 0, begleiter: 0, futter: 0, unterstuetzen: 0, alle: 0 })
  })
})

describe('isSectionEmpty', () => {
  test('Unterstützen ist mit Aufruf-Text oder Bericht nicht leer, auch ohne Spendenwege', () => {
    const withText = normalizeDiscover({ unterstuetzen: { text: 'Jeder Euro hilft.' } })
    expect(isSectionEmpty('unterstuetzen', withText)).toBe(false)
    expect(isSectionEmpty('unterstuetzen', normalizeDiscover({ unterstuetzen: { bericht: { zeitraum: 'Q3' } } }))).toBe(false)
    expect(isSectionEmpty('unterstuetzen', normalizeDiscover({}))).toBe(true)
    expect(isSectionEmpty('futter', normalizeDiscover({ futter: [item(1)] }))).toBe(false)
  })
})

describe('limitGroups', () => {
  test('nimmt die ersten Einträge über alle Listen hinweg, in ihrer Reihenfolge', () => {
    const groups = limitGroups([[item(1), item(2)], [item(3), item(4)], [item(5)]], 3)
    expect(groups.map((items) => items.map((entry) => entry.id))).toEqual([[1, 2], [3], []])
    expect(countItems(groups)).toBe(3)
  })

  test('die eigene Karte der Kundensicht bleibt auch jenseits der Grenze', () => {
    const groups = limitGroups([[item(1), item(2), item(3)], [item(4, { vorschau: true })]], 3)
    expect(groups[1].map((entry) => entry.id)).toEqual([4])
  })

  test('ohne endliche Grenze bleibt alles', () => {
    const groups = [[item(1)], [item(2)]]
    expect(limitGroups(groups, Infinity)).toBe(groups)
  })
})
