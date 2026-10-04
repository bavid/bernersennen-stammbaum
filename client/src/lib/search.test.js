// @vitest-environment jsdom
import { afterEach, describe, expect, test } from 'vitest'
import { getTheme } from '../themes/index.js'
import {
  SHORTCUT_GROUP,
  buildSections,
  clearRecent,
  countResults,
  flattenOptions,
  groupTitles,
  loadRecent,
  matchShortcuts,
  resultTarget,
  saveRecent,
  searchableQuery,
  shortcutsFor,
  withRecent
} from './search.js'

const words = getTheme('standard').words
const home = { id: 1, name: 'Zuhause Lindenhof', art: 'zuhause' }
const atHome = { ...home, home, role: 'leitung', memberships: [] }
const classic = { id: 2, name: 'Rudel vom Heidekamp', art: 'rudel', role: 'mitglied', home: { id: 2, name: 'Rudel vom Heidekamp', art: 'rudel' } }
const eigen = { id: 1, name: 'Zuhause Lindenhof', art: 'eigen' }
const familie = { id: 7, name: 'Familie Sonnenhang', art: 'familie' }

afterEach(() => window.localStorage.clear())

describe('Suche: Ziele der Treffer', () => {
  test('Tiere, Erinnerungen, Pinnwand, Familien und Partner', () => {
    expect(resultTarget('tiere', { id: 3, bereich: familie })).toBe('/tier/3?in=7')
    expect(resultTarget('erinnerungen', { id: 12, tier: { id: 3 }, bereich: eigen })).toBe('/tier/3?in=1#entry-12')
    expect(resultTarget('pinnwand', { id: 4, bereich: eigen })).toBe('/pinnwand?in=home')
    expect(resultTarget('pinnwand', { id: 4, bereich: familie })).toBe('/familien/7?reiter=pinnwand')
    expect(resultTarget('familien', { id: 9, art: 'besuch' })).toBe('/familien/9')
    expect(resultTarget('partner', { slug: 'pfoten glück' })).toBe('/p/pfoten%20gl%C3%BCck')
    expect(resultTarget('unbekannt', {})).toBeNull()
  })
})

describe('Suche: Abkürzungen', () => {
  test('im Zuhause alle sechs, beim klassischen Login ohne Beitreten (und als Mitglied ohne Einladen)', () => {
    expect(shortcutsFor(atHome, words).map((s) => s.key)).toEqual(['einstellungen', 'bilderrahmen', 'einladen', 'collage', 'hilfe', 'beitreten'])
    expect(shortcutsFor(classic, words).map((s) => s.key)).toEqual(['einstellungen', 'bilderrahmen', 'collage', 'hilfe'])
    expect(shortcutsFor(atHome, { ...words, group: 'Rudel' }).at(-1).label).toBe('Rudel beitreten')
  })

  test('passen über Namen und Synonyme, mit Umlauten und ohne', () => {
    const shortcuts = shortcutsFor(atHome, words)
    const keys = (q) => matchShortcuts(shortcuts, q).map((s) => s.key)
    expect(keys('diashow')).toEqual(['bilderrahmen'])
    expect(keys('Fotos')).toEqual(['bilderrahmen', 'collage'])
    expect(keys('gruenden')).toEqual(['beitreten'])
    expect(keys('schlussel')).toEqual(['einstellungen'])
    expect(keys('hilfe')).toEqual(['hilfe'])
    expect(keys('e')).toEqual([])
    expect(keys('zzz')).toEqual([])
  })
})

describe('Suche: Verlauf auf diesem Gerät', () => {
  test('höchstens fünf, neueste zuerst, gleiche nur einmal, je Zuhause getrennt', () => {
    let list = []
    for (const q of ['Benno', 'Nele', 'Strand', 'Ball', 'Mia', 'benno', ' a ']) list = withRecent(list, q)
    expect(list).toEqual(['benno', 'Mia', 'Ball', 'Strand', 'Nele'])
    saveRecent(atHome, list)
    expect(loadRecent(atHome)).toEqual(list)
    expect(loadRecent({ ...atHome, id: 7 })).toEqual(list)
    expect(loadRecent(classic)).toEqual([])
    clearRecent(atHome)
    expect(loadRecent(atHome)).toEqual([])
  })

  test('kaputte gespeicherte Werte werden ignoriert', () => {
    window.localStorage.setItem('chronik.suche.verlauf.1', '{"kein":"array"}')
    expect(loadRecent(atHome)).toEqual([])
    window.localStorage.setItem('chronik.suche.verlauf.1', JSON.stringify(['ok', 3, 'x', 'y'.repeat(81)]))
    expect(loadRecent(atHome)).toEqual(['ok'])
    window.localStorage.setItem('chronik.suche.verlauf.1', 'kein json')
    expect(loadRecent(atHome)).toEqual([])
  })
})

describe('Suche: Abschnitte und Optionen', () => {
  const titles = groupTitles(words)
  const tiere = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, name: `Tier ${i + 1}`, bereich: eigen }))

  test('höchstens fünf je Gruppe, dahinter "Alle n anzeigen" - aufgeklappt alle, Reihenfolge der Gruppen fest', () => {
    const gruppen = { partner: { treffer: [{ id: 1, slug: 'a' }], mehr: false }, tiere: { treffer: tiere, mehr: true }, pinnwand: { treffer: [], mehr: false } }
    const shortcuts = [{ key: 'hilfe', label: 'Hilfe & Kontakt' }]
    const sections = buildSections({ gruppen, shortcuts, expanded: [], titles, idPrefix: 's' })
    expect(sections.map((s) => [s.key, s.title, s.options.length])).toEqual([
      ['tiere', 'Tiere', 6],
      ['partner', 'Partner', 1],
      [SHORTCUT_GROUP, 'Abkürzungen', 1]
    ])
    expect(sections[0].options.at(-1)).toEqual({ id: 's-tiere-alle', kind: 'expand', group: 'tiere', count: 7 })
    expect(sections[0].more).toBe(false)
    expect(flattenOptions(sections).map((o) => o.id)).toEqual(['s-tiere-1', 's-tiere-2', 's-tiere-3', 's-tiere-4', 's-tiere-5', 's-tiere-alle', 's-partner-1', `s-${SHORTCUT_GROUP}-hilfe`])

    const open = buildSections({ gruppen, shortcuts, expanded: ['tiere'], titles, idPrefix: 's' })
    expect(open[0].options).toHaveLength(7)
    expect(open[0].more).toBe(true)
    expect(countResults(gruppen, shortcuts)).toBe(9)
  })

  test('Suchbegriff: ab zwei Zeichen, Leerraum zusammengefasst', () => {
    expect(searchableQuery(' a ')).toBeNull()
    expect(searchableQuery('  Strand   tag ')).toBe('Strand tag')
    expect(searchableQuery(undefined)).toBeNull()
  })
})
