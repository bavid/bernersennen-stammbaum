import { describe, expect, test } from 'vitest'
import { circleAnimals, isInMemory } from './animalCircles.js'

const dog = (id, name, extra = {}) => ({ id, name, can_edit: 1, ...extra })

describe('circleAnimals – „Eure Tiere“ auf Start', () => {
  test('erst die, die bei euch leben (nach Name), dann die verstorbenen; ohne geteilte, Platzhalter und Ausgezogene', () => {
    const dogs = [
      dog(1, 'Nele'),
      dog(2, 'Balu', { bei_uns_bis: '2019-11-02', abschied_grund: 'verstorben' }),
      dog(3, 'Flocke'),
      dog(4, 'Gast', { shared_from: 'Zuhause Möwenweg', can_edit: 0 }),
      dog(5, '', { name_unbekannt: 1 }),
      dog(6, 'Rudi', { bei_uns_bis: '2024-01-01', abschied_grund: 'abgegeben' }),
      dog(7, 'Anton vom Deich')
    ]
    expect(circleAnimals(dogs).map((entry) => entry.id)).toEqual([7, 3, 1, 2])
  })

  test('ohne Tiere eine leere Liste', () => {
    expect(circleAnimals()).toEqual([])
  })

  test('isInMemory: nur gegangen und verstorben', () => {
    expect(isInMemory(dog(1, 'A', { bei_uns_bis: '2020-01-01', abschied_grund: 'verstorben' }))).toBe(true)
    expect(isInMemory(dog(1, 'A', { bei_uns_bis: '2020-01-01', abschied_grund: 'umgezogen' }))).toBe(false)
    expect(isInMemory(dog(1, 'A', { abschied_grund: 'verstorben' }))).toBe(false)
  })
})
