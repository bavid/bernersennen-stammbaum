import { describe, expect, test } from 'vitest'
import { buildFamilyGroups, familyAnimals, hasFamilyTree, overviewMode, selectedGroup, shortAreaName } from './familyGroups.js'

const dog = (id, name, extra = {}) => ({ id, name, geschlecht: 'huendin', tierart: 'hund', mother_dog_id: null, father_dog_id: null, ...extra })

const home = {
  id: 1,
  name: 'Zuhause am Deich',
  art: 'zuhause',
  home: { id: 1, name: 'Zuhause am Deich', art: 'zuhause' },
  memberships: [
    { id: 7, name: 'Familie Sonnenhang', rolle: 'leitung' },
    { id: 9, name: 'Familie Lindenweg', rolle: 'gast' }
  ]
}

describe('hasFamilyTree – der Stammbaum ist ein Zusatz', () => {
  test('ohne Verpaarung und ohne Eltern: kein Stammbaum', () => {
    expect(hasFamilyTree({ dogs: [dog(1, 'Nele'), dog(2, 'Mira')], allDogs: [], events: [] })).toBe(false)
    expect(hasFamilyTree({})).toBe(false)
  })

  test('eine eingetragene Verpaarung reicht', () => {
    expect(hasFamilyTree({ dogs: [dog(1, 'Nele')], events: [{ id: 3, mutter_dog_id: 1 }] })).toBe(true)
  })

  test('ein Tier mit bekanntem Elternteil im Baum reicht - auch ein Elternteil aus einem anderen Bereich', () => {
    expect(hasFamilyTree({ dogs: [dog(1, 'Bella'), dog(2, 'Cora', { mother_dog_id: 1 })] })).toBe(true)
    const external = [dog(5, 'Aiko', { geschlecht: 'ruede', familyName: 'Familie Sonnenhang' })]
    expect(hasFamilyTree({ dogs: [dog(2, 'Cora', { father_dog_id: 5 })], allDogs: external })).toBe(true)
  })

  test('ein Elternteil, der nicht in den Daten steht, zählt nicht', () => {
    expect(hasFamilyTree({ dogs: [dog(2, 'Cora', { mother_dog_id: 99 })], allDogs: [] })).toBe(false)
  })
})

describe('overviewMode – welche Ansicht die Familienbande zeigt', () => {
  test('zuerst Familien; der Stammbaum nur auf Wunsch und wenn es ihn gibt', () => {
    const base = { loaded: true }
    expect(overviewMode({ ...base, wantsTree: false, treeAvailable: true })).toBe('families')
    expect(overviewMode({ ...base, wantsTree: true, treeAvailable: true })).toBe('tree')
    expect(overviewMode({ ...base, wantsTree: true, treeAvailable: false })).toBe('families')
  })

  test('ein Stammbaum-Link wartet auf die Verpaarungen, statt kurz die Familien zu zeigen', () => {
    expect(overviewMode({ wantsTree: true, treeAvailable: false, loaded: false })).toBe('pending')
  })
})

describe('familyAnimals – unbekannte Eltern nur im Stammbaum (Familienbande 2)', () => {
  test('ein "Unbekannt", das Mutter oder Vater eines Tiers ist, steht nicht im Raster', () => {
    const unknownMother = dog(6, 'Unbekannt', { name_unbekannt: 1 })
    const unknownFather = dog(7, 'Unbekannt', { geschlecht: 'ruede', name_unbekannt: 1 })
    const luna = dog(8, 'Luna', { mother_dog_id: 6, father_dog_id: 7 })
    expect(familyAnimals([unknownMother, unknownFather, luna]).map((d) => d.name)).toEqual(['Luna'])
  })

  test('ein Tier mit unbekanntem Namen, das niemandes Elternteil ist (z. B. ein Fundtier), bleibt', () => {
    const fundkatze = dog(9, 'Unbekannt', { tierart: 'katze', name_unbekannt: 1 })
    const bella = dog(1, 'Bella')
    expect(familyAnimals([bella, fundkatze, dog(2, 'Cora', { mother_dog_id: 1 })])).toHaveLength(3)
    expect(familyAnimals()).toEqual([])
  })
})

describe('shortAreaName – Kurzname im Filter', () => {
  test('ohne "(Demo)" und ohne "Zuhause " vor einem Eigennamen', () => {
    expect(shortAreaName('Zuhause Lindenhof (Demo)')).toBe('Lindenhof')
    expect(shortAreaName('Zuhause Möwenweg')).toBe('Möwenweg')
    expect(shortAreaName('Zuhause Über den Dächern')).toBe('Über den Dächern')
  })

  test('"Zuhause am Deich" und andere Namen bleiben', () => {
    expect(shortAreaName('Zuhause am Deich')).toBe('Zuhause am Deich')
    expect(shortAreaName('Haus Birkenweg')).toBe('Haus Birkenweg')
    expect(shortAreaName('Zuhause')).toBe('Zuhause')
    expect(shortAreaName('(Demo)')).toBe('(Demo)')
  })
})

describe('buildFamilyGroups – Abschnitte der Familienbande', () => {
  const nele = dog(11, 'Nele', { family_id: 1, shares: [7] })
  const mira = dog(12, 'Mira', { family_id: 1, shares: [7, 9] })
  const balu = dog(13, 'Balu', { family_id: 1, geschlecht: 'ruede', shares: [] })

  test('eigenes Zuhause: "Zuhause" mit allen eigenen Tieren', () => {
    const groups = buildFamilyGroups({ family: home, dogs: [nele, mira, balu] })
    expect(groups.owners.map((g) => [g.kind, g.title, g.dogs.map((d) => d.name)])).toEqual([['zuhause', 'Zuhause', ['Nele', 'Mira', 'Balu']]])
  })

  test('eine Familie: zuerst die Familie selbst, dann die Zuhause ihrer Mitglieder (alphabetisch)', () => {
    const family = { id: 7, name: 'Familie Sonnenhang', art: 'rudel', home: home.home, memberships: home.memberships }
    const dogs = [
      dog(1, 'Bella', { family_id: 7 }),
      dog(11, 'Nele', { family_id: 1, shared_from: 'Zuhause am Deich' }),
      dog(21, 'Wilma', { family_id: 4, shared_from: 'Zuhause Möwenweg' }),
      dog(12, 'Mira', { family_id: 1, shared_from: 'Zuhause am Deich' })
    ]
    const groups = buildFamilyGroups({ family, dogs })
    expect(groups.owners.map((g) => [g.kind, g.param, g.title, g.dogs.map((d) => d.name)])).toEqual([
      ['familie', 'eigen', 'Familie Sonnenhang', ['Bella']],
      ['zuhause', '1', 'Zuhause am Deich', ['Nele', 'Mira']],
      ['zuhause', '4', 'Zuhause Möwenweg', ['Wilma']]
    ])
    // ?gruppe= wählt eine Gruppe; ohne Angabe oder mit einem Wert, den es nicht gibt: alle Tiere
    expect(selectedGroup(groups.owners, '1').title).toBe('Zuhause am Deich')
    expect(selectedGroup(groups.owners, 'eigen').title).toBe('Familie Sonnenhang')
    expect(selectedGroup(groups.owners, '99')).toBeNull()
    expect(selectedGroup(groups.owners, null)).toBeNull()
  })

  test('eine Familie ohne eigene Tiere beginnt direkt mit den Zuhause', () => {
    const family = { id: 7, name: 'Familie Sonnenhang', art: 'rudel', home: null, memberships: [] }
    const groups = buildFamilyGroups({ family, dogs: [dog(11, 'Nele', { family_id: 1, shared_from: 'Zuhause am Deich' })] })
    expect(groups.owners.map((g) => g.title)).toEqual(['Zuhause am Deich'])
  })

  test('zu Besuch: nur das besuchte Zuhause, keine Familien des Gasts', () => {
    const visit = { ...home, id: 4, name: 'Zuhause Möwenweg', zuBesuch: true, role: 'gast' }
    const groups = buildFamilyGroups({ family: visit, dogs: [dog(21, 'Wilma', { family_id: 4, shares: [] })] })
    expect(groups.owners.map((g) => g.title)).toEqual(['Zuhause'])
  })

  test('Tierheim: der Bereichsname statt "Zuhause"', () => {
    const shelter = { id: 30, name: 'Tierheim Kleeblatt', art: 'tierheim', home: { id: 30 }, memberships: [] }
    const groups = buildFamilyGroups({ family: shelter, dogs: [dog(31, 'Struppi', { family_id: 30 })] })
    expect(groups.owners.map((g) => [g.kind, g.title])).toEqual([['bereich', 'Tierheim Kleeblatt']])
  })
})
