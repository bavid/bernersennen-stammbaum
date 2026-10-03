import { describe, expect, test } from 'vitest'
import {
  buildFamilyGroups,
  countFamilyGroups,
  friendHomes,
  hasFamilyTree,
  nameList,
  overviewMode,
  relationChips
} from './familyGroups.js'

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
  test('ohne Familien-Ansicht (Berner): immer der Stammbaum', () => {
    expect(overviewMode({ familiesView: false, wantsTree: false, treeAvailable: false, loaded: false })).toBe('tree')
  })

  test('Standard: zuerst Familien; der Stammbaum nur auf Wunsch und wenn es ihn gibt', () => {
    const base = { familiesView: true, loaded: true }
    expect(overviewMode({ ...base, wantsTree: false, treeAvailable: true })).toBe('families')
    expect(overviewMode({ ...base, wantsTree: true, treeAvailable: true })).toBe('tree')
    expect(overviewMode({ ...base, wantsTree: true, treeAvailable: false })).toBe('families')
  })

  test('ein Stammbaum-Link wartet auf die Verpaarungen, statt kurz die Familien zu zeigen', () => {
    expect(overviewMode({ familiesView: true, wantsTree: true, treeAvailable: false, loaded: false })).toBe('pending')
  })
})

describe('nameList', () => {
  test('ein, zwei, drei Namen und mehr', () => {
    expect(nameList([dog(1, 'Cora')])).toBe('Cora')
    expect(nameList([dog(1, 'Cora'), dog(2, 'Dante vom Sonnenhang')])).toBe('Cora und Dante')
    expect(nameList([dog(1, 'A'), dog(2, 'B'), dog(3, 'C')])).toBe('A, B und C')
    expect(nameList([dog(1, 'A'), dog(2, 'B'), dog(3, 'C'), dog(4, 'D')])).toBe('A, B und 2 weiteren')
    expect(nameList([dog(1, 'Unbekannt', { name_unbekannt: 1 })])).toBe('Unbekannt')
  })
})

describe('relationChips – kleine Beziehungs-Chips statt Linien', () => {
  const bella = dog(1, 'Bella vom Emmental')
  const aiko = dog(2, 'Aiko', { geschlecht: 'ruede' })
  const cora = dog(3, 'Cora', { mother_dog_id: 1, father_dog_id: 2 })
  const dante = dog(4, 'Dante', { geschlecht: 'ruede', mother_dog_id: 1, father_dog_id: 2 })
  const mira = dog(5, 'Mira', { tierart: 'katze' })
  const nodes = [bella, aiko, cora, dante, mira]
  const links = [{ dog_a_id: 3, dog_b_id: 5 }]
  const texts = (subject) => relationChips(subject, nodes, links).map((chip) => chip.text)

  test('Mutter und Vater von ihren Kindern', () => {
    expect(texts(bella)).toEqual(['Mutter von Cora und Dante'])
    expect(texts(aiko)).toEqual(['Vater von Cora und Dante'])
  })

  test('Kind, Geschwister und Mitbewohner', () => {
    expect(texts(cora)).toEqual(['Kind von Bella und Aiko', 'Geschwister von Dante', 'lebt mit Mira'])
    expect(texts(mira)).toEqual(['lebt mit Cora'])
  })

  test('ohne bekannte Beziehungen: keine Chips; Verweise ins Leere zählen nicht', () => {
    expect(relationChips(dog(8, 'Flocke', { mother_dog_id: 99 }), nodes, [{ dog_a_id: 8, dog_b_id: 98 }])).toEqual([])
  })

  test('jeder Chip trägt seine Art', () => {
    expect(relationChips(cora, nodes, links).map((chip) => chip.kind)).toEqual(['eltern', 'geschwister', 'mitbewohner'])
  })
})

describe('buildFamilyGroups – Abschnitte der Familienbande', () => {
  const nele = dog(11, 'Nele', { family_id: 1, shares: [7] })
  const mira = dog(12, 'Mira', { family_id: 1, shares: [7, 9] })
  const balu = dog(13, 'Balu', { family_id: 1, geschlecht: 'ruede', shares: [] })

  test('eigenes Zuhause: "Zuhause" mit allen eigenen Tieren, dann je Familie die dort gezeigten', () => {
    const groups = buildFamilyGroups({ family: home, dogs: [nele, mira, balu] })
    expect(groups.owners.map((g) => [g.kind, g.title, g.dogs.map((d) => d.name)])).toEqual([['zuhause', 'Zuhause', ['Nele', 'Mira', 'Balu']]])
    expect(groups.memberships.map((g) => [g.id, g.title, g.dogs.map((d) => d.name)])).toEqual([
      [7, 'Familie Sonnenhang', ['Nele', 'Mira']],
      [9, 'Familie Lindenweg', ['Mira']]
    ])
    expect(groups.friends).toEqual([])
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
    expect(groups.owners.map((g) => [g.kind, g.title, g.dogs.map((d) => d.name)])).toEqual([
      ['familie', 'Familie Sonnenhang', ['Bella']],
      ['zuhause', 'Zuhause am Deich', ['Nele', 'Mira']],
      ['zuhause', 'Zuhause Möwenweg', ['Wilma']]
    ])
    // Die Mitgliedschaften des Haushalts gehören ins eigene Zuhause, nicht in die Familie
    expect(groups.memberships).toEqual([])
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
    expect(groups.memberships).toEqual([])
  })

  test('Tierheim: der Bereichsname statt "Zuhause"', () => {
    const shelter = { id: 30, name: 'Tierheim Kleeblatt', art: 'tierheim', home: { id: 30 }, memberships: [] }
    const groups = buildFamilyGroups({ family: shelter, dogs: [dog(31, 'Struppi', { family_id: 30 })] })
    expect(groups.owners.map((g) => [g.kind, g.title])).toEqual([['bereich', 'Tierheim Kleeblatt']])
  })

  test('countFamilyGroups zählt jeden Abschnitt und jedes befreundete Zuhause', () => {
    const friends = [{ id: 4, name: 'Zuhause Möwenweg', canVisit: true, tiere: [] }]
    const groups = buildFamilyGroups({ family: home, dogs: [nele, mira, balu], friends })
    expect(countFamilyGroups(groups)).toBe(4)
    expect(countFamilyGroups(buildFamilyGroups({ family: home, dogs: [] }))).toBe(2)
  })
})

describe('friendHomes – befreundete Zuhause aus den Besuchen', () => {
  const visits = {
    besuche: [{ id: 4, name: 'Zuhause Möwenweg', seit: '2026-08-01' }],
    gaeste: [
      { id: 4, name: 'Zuhause Möwenweg', seit: '2026-08-03' },
      { id: 6, name: 'Zuhause Birkenhain', seit: '2026-09-01' }
    ]
  }
  const tiere = [
    { id: 21, name: 'Wilma', nameUnbekannt: false, tierart: 'hund', zuhauseId: 4, zuhause: 'Zuhause Möwenweg' },
    { id: 22, name: 'Pepper', nameUnbekannt: false, tierart: 'hund', zuhauseId: 5, zuhause: 'Zuhause Lindenhof' }
  ]

  test('beide Richtungen zusammengeführt, alphabetisch; nur die Tiere der Besuchs-Zuhause', () => {
    expect(friendHomes(visits, tiere)).toEqual([
      { id: 6, name: 'Zuhause Birkenhain', canVisit: false, tiere: [] },
      {
        id: 4,
        name: 'Zuhause Möwenweg',
        canVisit: true,
        tiere: [{ id: 21, name: 'Wilma', name_unbekannt: false, tierart: 'hund' }]
      }
    ])
  })

  test('leere oder fehlende Listen', () => {
    expect(friendHomes(undefined, undefined)).toEqual([])
    expect(friendHomes({ besuche: [], gaeste: [] }, tiere)).toEqual([])
  })
})
