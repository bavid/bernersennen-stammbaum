import { describe, expect, test } from 'vitest'
import { dogHeadLine, dogTabs, hasRelatives, originLine, recentItems, safeFromPath, stayOwnerName, treeRoute, visibleInNames } from './dogProfile.js'

const TODAY = '2026-10-04'

describe('dogTabs', () => {
  test('Haushalt und Familie: Chronik · Infos · Verwandte', () => {
    expect(dogTabs().map((tab) => [tab.key, tab.label])).toEqual([
      ['chronik', 'Chronik'],
      ['infos', 'Infos'],
      ['verwandte', 'Verwandte']
    ])
  })

  test('eigene Tiere eines Tierheims: Chronik · Vermittlung · Infos', () => {
    expect(dogTabs({ shelter: true }).map((tab) => tab.key)).toEqual(['chronik', 'vermittlung', 'infos'])
  })
})

describe('dogHeadLine', () => {
  test('Rasse · Alter · bei euch seit …', () => {
    const dog = { rasse: 'Mischling', geburtsdatum: '2019-03-10', bei_uns_seit: '2021-06-12' }
    expect(dogHeadLine(dog, { today: TODAY })).toEqual({ text: 'Mischling · 7 Jahre · bei euch seit 12. Juni 2021', memorial: false })
  })

  test('ein hierher geteiltes Tier lebt „im“ Zuhause seiner Familie', () => {
    const dog = { rasse: 'Mischling', bei_uns_seit: '2021-06-12' }
    expect(dogHeadLine(dog, { ownerName: 'Zuhause am Deich', today: TODAY }).text).toBe('Mischling · im Zuhause am Deich seit 12. Juni 2021')
  })

  test('gegangene Tiere: kein Alter, dafür die Zeit bei euch', () => {
    const dog = { rasse: 'Labrador', geburtsdatum: '2006-05-01', bei_uns_seit: '2008-03-15', bei_uns_bis: '2019-11-02', abschied_grund: 'verstorben' }
    expect(dogHeadLine(dog, { today: TODAY })).toEqual({ text: 'Labrador · In Erinnerung · 2008–2019', memorial: true })
  })

  test('ohne Angaben leer', () => {
    expect(dogHeadLine({}, { today: TODAY })).toEqual({ text: '', memorial: false })
  })

  test('stay: false - ohne „seit …“ (das sagt bei fremden Tieren die Zeile darunter, originLine)', () => {
    const dog = { rasse: 'Mischling', geburtsdatum: '2019-03-10', bei_uns_seit: '2021-06-12' }
    expect(dogHeadLine(dog, { stay: false, today: TODAY }).text).toBe('Mischling · 7 Jahre')
  })
})

describe('stayOwnerName: „bei euch“ oder „Im {Zuhause}“ - im Kopf und in den Infos gleich', () => {
  const inFamily = { id: 2, art: 'rudel', home: { id: 3 } }
  test('ein fremdes Tier: der Name seines Zuhauses', () => {
    expect(stayOwnerName({ canEdit: false, ownerFamilyId: 9, familyName: 'Zuhause Möwenweg' }, inFamily)).toBe('Zuhause Möwenweg')
  })
  test('ein eigenes (auch in die Familie geteiltes) und ein bearbeitbares Tier: „bei euch“', () => {
    expect(stayOwnerName({ canEdit: false, ownerFamilyId: 3, familyName: 'Zuhause am Deich' }, inFamily)).toBeUndefined()
    expect(stayOwnerName({ canEdit: true, ownerFamilyId: 2, familyName: 'Familie Sonnenhang' }, inFamily)).toBeUndefined()
    expect(stayOwnerName(null, inFamily)).toBeUndefined()
  })
})

describe('originLine: wo ein Tier lebt, das nicht euch gehört', () => {
  const home = { id: 3, name: 'Zuhause am Deich', art: 'zuhause' }
  const inFamily = { id: 2, name: 'Familie Sonnenhang', art: 'rudel', home }
  const wilma = { familyName: 'Zuhause Möwenweg', ownerFamilyId: 9, canEdit: false }

  test('in einer Familie: das Zuhause des Tiers und über welche Familie ihr es seht', () => {
    expect(originLine(wilma, inFamily)).toBe('lebt bei Zuhause Möwenweg · geteilt mit euch über Familie Sonnenhang')
  })

  test('im Tierheim (ein vermitteltes Tier): das neue Zuhause und dass ihr mitlest', () => {
    const shelter = { id: 4, name: 'Tierheim Sonnenhang', art: 'tierheim', home: { id: 4, art: 'tierheim' } }
    expect(originLine({ ...wilma, familyName: 'Zuhause Lindenhof' }, shelter)).toBe('lebt bei Zuhause Lindenhof · ihr lest mit')
  })

  test('nichts für eigene Tiere, Tiere der Familie selbst, zu Besuch (der Chip sagt es) und ohne Namen', () => {
    expect(originLine({ ...wilma, canEdit: true }, inFamily)).toBeNull()
    expect(originLine({ ...wilma, ownerFamilyId: 3 }, inFamily), 'euer eigenes Tier, in die Familie geteilt').toBeNull()
    expect(originLine({ ...wilma, ownerFamilyId: 2 }, inFamily)).toBeNull()
    expect(originLine(wilma, { id: 9, name: 'Zuhause Möwenweg', art: 'zuhause', zuBesuch: true, home })).toBeNull()
    expect(originLine({ ...wilma, familyName: null }, inFamily)).toBeNull()
    expect(originLine(null, inFamily)).toBeNull()
  })
})

describe('visibleInNames', () => {
  test('die Namen der Familien, in die das Tier geteilt ist - in der Reihenfolge der Mitgliedschaften', () => {
    const memberships = [
      { id: 2, name: 'Familie Sonnenhang' },
      { id: 5, name: 'Familie Möwenweg' }
    ]
    expect(visibleInNames({ shares: [5, 2] }, memberships)).toEqual(['Familie Sonnenhang', 'Familie Möwenweg'])
    expect(visibleInNames({ shares: [] }, memberships)).toEqual([])
    expect(visibleInNames({}, undefined)).toEqual([])
  })
})

describe('hasRelatives', () => {
  test('eingetragene Eltern, Geschwister oder Nachwuchs zählen - ein Elternteil nur als Freitext nicht', () => {
    expect(hasRelatives({ children: [] })).toBe(false)
    expect(hasRelatives({ mother: { id: 1 }, children: [] })).toBe(true)
    expect(hasRelatives({ father_freitext: 'Balu', children: [] })).toBe(false)
    expect(hasRelatives({ siblings: [{ id: 3 }], children: [] })).toBe(true)
    expect(hasRelatives({ children: [{ id: 4 }] })).toBe(true)
  })
})

describe('treeRoute', () => {
  test('im Zuhause /tiere, in einer Familie der Reiter Tiere der Gruppenseite - jeweils mit dem Stammbaum', () => {
    const home = { id: 3, art: 'zuhause', home: { id: 3, art: 'zuhause' } }
    const group = { id: 2, art: 'rudel', home: { id: 3, art: 'zuhause' } }
    expect(treeRoute(home)).toBe('/tiere?ansicht=stammbaum')
    expect(treeRoute(group)).toBe('/familien/2?reiter=tiere&ansicht=stammbaum')
  })
})

describe('safeFromPath', () => {
  test('nur eigene Pfade der App', () => {
    expect(safeFromPath('/start')).toBe('/start')
    expect(safeFromPath('/familien/2?reiter=beitraege')).toBe('/familien/2?reiter=beitraege')
    expect(safeFromPath('//evil.example')).toBeNull()
    expect(safeFromPath('https://evil.example')).toBeNull()
    expect(safeFromPath('/\\evil')).toBeNull()
    expect(safeFromPath('/\t/evil.example')).toBeNull()
    expect(safeFromPath('/start\n')).toBeNull()
    expect(safeFromPath(undefined)).toBeNull()
    expect(safeFromPath(42)).toBeNull()
  })
})

describe('recentItems', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f'].map((key) => ({ key }))
  const keys = (result) => result.shown.map((item) => item.key)

  test('älteste zuerst: die letzten vier, zwei verborgen; jüngste zuerst: die ersten vier', () => {
    expect(keys(recentItems(items))).toEqual(['c', 'd', 'e', 'f'])
    expect(recentItems(items).hidden).toBe(2)
    expect(keys(recentItems(items, { newestFirst: true }))).toEqual(['a', 'b', 'c', 'd'])
  })

  test('wenige Einträge, "alle anzeigen" oder ein Ziel im verborgenen Teil: alles', () => {
    expect(recentItems(items.slice(0, 4)).hidden).toBe(0)
    // nur ein einzelner verborgener Punkt: lieber alles zeigen
    expect(recentItems(items.slice(0, 5)).hidden).toBe(0)
    expect(keys(recentItems(items, { showAll: true }))).toHaveLength(6)
    expect(keys(recentItems(items, { keepKey: 'a' }))).toHaveLength(6)
    expect(keys(recentItems(items, { keepKey: 'e' }))).toEqual(['c', 'd', 'e', 'f'])
    expect(keys(recentItems(items, { keepKey: 'unbekannt' }))).toEqual(['c', 'd', 'e', 'f'])
  })
})
