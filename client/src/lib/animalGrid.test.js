import { describe, expect, test } from 'vitest'
import { animalLink, areaGrid, gridGroups, selectedGridGroup } from './animalGrid.js'

const home = { id: 1, name: 'Zuhause Lindenhof', art: 'eigen', anzahl: 2 }
const family = { id: 7, name: 'Familie Sonnenhang (Demo)', art: 'familie', anzahl: 3 }
const visit = { id: 9, name: 'Zuhause Möwenweg', art: 'besuch', anzahl: 1 }

describe('gridGroups', () => {
  test('je Bereich mit Tieren ein Filter: „Mein Zuhause“, sonst der Name ohne „(Demo)“; ?gruppe= eigen bzw. die Id', () => {
    expect(gridGroups([home, family, { ...visit, anzahl: 0 }, { ...visit, id: 10, name: 'Zuhause am Deich' }])).toEqual([
      { param: 'eigen', label: 'Mein Zuhause', title: 'Zuhause Lindenhof', count: 2, areaId: 1 },
      { param: '7', label: 'Familie Sonnenhang', title: 'Familie Sonnenhang (Demo)', count: 3, areaId: 7 },
      { param: '10', label: 'Zuhause am Deich', title: 'Zuhause am Deich', count: 1, areaId: 10 }
    ])
  })

  test('nur ein Bereich mit Tieren: kein Filter', () => {
    expect(gridGroups([home, { ...family, anzahl: 0 }])).toEqual([])
    expect(gridGroups([])).toEqual([])
    expect(gridGroups()).toEqual([])
  })

  test('die gewählte Gruppe aus der Adresse - unbekannt oder leer: alle', () => {
    const groups = gridGroups([home, family])
    expect(selectedGridGroup(groups, '7').label).toBe('Familie Sonnenhang')
    expect(selectedGridGroup(groups, 'eigen').label).toBe('Mein Zuhause')
    expect(selectedGridGroup(groups, '99')).toBeNull()
    expect(selectedGridGroup(groups, null)).toBeNull()
  })
})

describe('animalLink', () => {
  test('eigene Tiere ohne ?in, alle anderen in ihren Bereich', () => {
    expect(animalLink({ id: 3, area: home })).toBe('/tier/3')
    expect(animalLink({ id: 4, area: family })).toBe('/tier/4?in=7')
    expect(animalLink({ id: 5, area: visit })).toBe('/tier/5?in=9')
    expect(animalLink({ id: 6 })).toBe('/tier/6')
  })
})

describe('areaGrid (Gruppenseite)', () => {
  const group = { id: 7, name: 'Familie Sonnenhang', art: 'rudel', home: { id: 1, name: 'Zuhause Lindenhof' } }
  const dogs = [
    { id: 31, name: 'Bella', family_id: 7 },
    { id: 11, name: 'Nele', family_id: 1, shared_from: 'Zuhause Lindenhof' },
    { id: 21, name: 'Wilma', family_id: 4, shared_from: 'Zuhause Möwenweg', mother_dog_id: 40 },
    { id: 40, name: 'Unbekannt', name_unbekannt: 1, family_id: 4, shared_from: 'Zuhause Möwenweg' }
  ]

  test('alle Tiere im Bereich der Familie; zuhause nur für fremde, nie das eigene Zuhause; ohne Platzhalter-Eltern', () => {
    const grid = areaGrid(group, dogs)
    const area = { id: 7, name: 'Familie Sonnenhang', art: 'familie' }
    expect(grid.areas).toEqual([{ ...area, anzahl: 3 }])
    expect(grid.tiere.map((dog) => [dog.name, dog.zuhause])).toEqual([
      ['Bella', null],
      ['Nele', null],
      ['Wilma', 'Zuhause Möwenweg']
    ])
    expect(grid.tiere.every((dog) => dog.area === grid.tiere[0].area)).toBe(true)
    expect(grid.tiere[0].area).toEqual(area)
  })

  test('Reihenfolge wie /tiere: wer noch da ist zuerst, dann die gegangenen - je nach Namen', () => {
    const grid = areaGrid(group, [
      { id: 1, name: 'Zora', family_id: 7 },
      { id: 2, name: 'Anton', family_id: 7, bei_uns_bis: '2024-01-01' },
      { id: 3, name: 'Emil', family_id: 7 }
    ])
    expect(grid.tiere.map((dog) => dog.name)).toEqual(['Emil', 'Zora', 'Anton'])
  })

  test('zu Besuch: Bereich „besuch“; lädt noch: null', () => {
    expect(areaGrid(group, dogs, { visiting: true }).areas[0].art).toBe('besuch')
    expect(areaGrid(group, null)).toBeNull()
  })
})
