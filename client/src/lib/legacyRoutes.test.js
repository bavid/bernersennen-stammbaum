import { describe, expect, test } from 'vitest'
import { legacyTarget } from './legacyRoutes.js'

const home = { id: 1, name: 'Zuhause am Deich', art: 'zuhause' }
const atHome = { ...home, home }
const inGroup = { id: 5, name: 'Familie Sonnenhang', art: 'rudel', home }
const visiting = { id: 9, name: 'Zuhause Möwenweg', art: 'zuhause', zuBesuch: true, home }
const classic = { id: 2, name: 'Rudel vom Heidekamp', art: 'rudel', home: { id: 2, art: 'rudel' } }

// Phase W: alte Adressen (Lesezeichen, geteilte Links, Links in älteren Seiten) führen an den neuen Ort - Query und
// Hash bleiben erhalten, nur der Reiter kommt dazu.
describe('legacyTarget', () => {
  test.each([
    ['wegbegleiter', atHome, '', '', '/tiere?ansicht=zeitleiste'],
    ['wegbegleiter', classic, '', '', '/tiere?ansicht=zeitleiste'],
    ['wegbegleiter', inGroup, '', '', '/tiere?ansicht=zeitleiste'],
    ['wegbegleiter', visiting, '', '', '/familien/9?reiter=zeitleiste'],
    ['wegbegleiter', atHome, '?x=1', '#nele', '/tiere?ansicht=zeitleiste&x=1#nele'],
    ['tree', atHome, '', '', '/tiere'],
    ['tree', atHome, '?ansicht=stammbaum', '', '/tiere?ansicht=stammbaum'],
    ['tree', atHome, '?gruppe=eigen', '#top', '/tiere?gruppe=eigen#top'],
    ['tree', classic, '?ansicht=stammbaum', '', '/tiere?ansicht=stammbaum'],
    ['tree', inGroup, '', '', '/familien/5?reiter=tiere'],
    ['tree', inGroup, '?ansicht=stammbaum&gruppe=3', '', '/familien/5?reiter=tiere&ansicht=stammbaum&gruppe=3'],
    ['tree', visiting, '?gruppe=eigen', '', '/familien/9?reiter=tiere&gruppe=eigen'],
    ['tree', inGroup, '?reiter=pinnwand', '', '/familien/5?reiter=tiere'],
    // Berner: die alte Seite war immer der Stammbaum (code-review W1, M2)
    ['tree', { ...atHome, theme: 'berner' }, '', '', '/tiere?ansicht=stammbaum'],
    ['tree', { ...inGroup, theme: 'berner' }, '?gruppe=3', '', '/familien/5?reiter=tiere&ansicht=stammbaum&gruppe=3'],
    ['tree', { ...classic, theme: 'berner' }, '?ansicht=zeitleiste', '', '/tiere?ansicht=zeitleiste'],
    ['pinnwand', inGroup, '', '', '/familien/5?reiter=pinnwand'],
    ['pinnwand', inGroup, '?x=1', '#note-3', '/familien/5?reiter=pinnwand&x=1#note-3'],
    ['mitglieder', inGroup, '', '', '/familien/5?reiter=mitglieder'],
    ['mitglieder', atHome, '', '', '/familien']
  ])('%s in %o + %s%s -> %s', (kind, family, search, hash, expected) => {
    expect(legacyTarget(kind, family, { search, hash })).toBe(expected)
  })

  test('Pinnwand im eigenen Zuhause, klassischer Login und unbekannte Arten: kein Ziel (die Seite bleibt)', () => {
    expect(legacyTarget('pinnwand', atHome)).toBeNull()
    expect(legacyTarget('pinnwand', classic)).toBeNull()
    expect(legacyTarget('mitglieder', classic)).toBeNull()
    expect(legacyTarget('irgendwas', atHome)).toBeNull()
  })
})
