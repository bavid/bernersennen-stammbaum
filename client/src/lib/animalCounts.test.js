import { describe, expect, test } from 'vitest'
import { animalCountText, areaCounts, countsFromDogs, withShareChange } from './animalCounts.js'
import { getTheme } from '../themes/index.js'

const words = getTheme('standard').words
const berner = getTheme('berner').words

describe('animalCountText (Phase W, Schritt 2: eine Zählung überall)', () => {
  test('"21 Tiere · davon 4 von euch"; ohne eigene nur die Zahl; Einzahl; Berner sagt Hunde', () => {
    expect(animalCountText({ tiere: 21, eigeneTiere: 4 }, words)).toBe('21 Tiere · davon 4 von euch')
    expect(animalCountText({ tiere: 7, eigeneTiere: 0 }, words)).toBe('7 Tiere')
    expect(animalCountText({ tiere: 7 }, words)).toBe('7 Tiere')
    expect(animalCountText({ tiere: 1, eigeneTiere: 1 }, words)).toBe('1 Tier · davon 1 von euch')
    expect(animalCountText({ tiere: 21, eigeneTiere: 4 }, berner)).toBe('21 Hunde · davon 4 von euch')
  })

  test('ohne Zahl (älterer Server) nichts', () => {
    expect(animalCountText(null, words)).toBeNull()
    expect(animalCountText({}, words)).toBeNull()
  })
})

describe('areaCounts / countsFromDogs', () => {
  const me = {
    id: 1,
    memberships: [{ id: 3, name: 'Familie Sonnenhang', tiere: 21, eigeneTiere: 4 }],
    besuche: [{ id: 9, name: 'Zuhause Möwenweg', tiere: 7 }]
  }

  test('aus me: je Familie mit eigenen, je besuchtem Zuhause nur die Zahl', () => {
    expect(areaCounts(me, 3)).toEqual({ tiere: 21, eigeneTiere: 4 })
    expect(areaCounts(me, 9)).toEqual({ tiere: 7, eigeneTiere: 0 })
    expect(areaCounts(me, 77)).toBeNull()
    expect(areaCounts({ ...me, memberships: [{ id: 3 }] }, 3)).toBeNull()
  })

  test('aus geladenen Tieren: ohne Platzhalter unbekannter Eltern, eigene = die des Zuhauses', () => {
    const dogs = [
      { id: 1, family_id: 3, mother_dog_id: 2 },
      { id: 2, family_id: 3, name_unbekannt: 1 },
      { id: 3, family_id: 1 },
      { id: 4, family_id: 1 }
    ]
    expect(countsFromDogs(dogs, 1)).toEqual({ tiere: 3, eigeneTiere: 2 })
    expect(countsFromDogs(null, 1)).toBeNull()
  })
})

describe('withShareChange (Zahlen in me nach einer Freigabe)', () => {
  const family = {
    id: 1,
    memberships: [
      { id: 3, name: 'Familie Sonnenhang', tiere: 21, eigeneTiere: 4 },
      { id: 5, name: 'Familie Möwenweg', tiere: 6, eigeneTiere: 0 }
    ]
  }

  test('neu geteilt zählt dort mit, nicht mehr geteilt nicht mehr - die anderen Familien bleiben, wie sie sind', () => {
    const next = withShareChange(family, { id: 10 }, [3], [5])
    expect(next.memberships).toEqual([
      { id: 3, name: 'Familie Sonnenhang', tiere: 20, eigeneTiere: 3 },
      { id: 5, name: 'Familie Möwenweg', tiere: 7, eigeneTiere: 1 }
    ])
    expect(family.memberships[0].tiere).toBe(21)
  })

  test('ohne Änderung oder für einen Platzhalter (unbekannter Elternteil) dasselbe Objekt', () => {
    expect(withShareChange(family, { id: 10 }, [3], [3])).toBe(family)
    expect(withShareChange(family, { id: 2, name_unbekannt: 1, children: [{ id: 10 }] }, [], [3])).toBe(family)
  })
})
