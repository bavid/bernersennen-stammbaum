import { describe, expect, test } from 'vitest'
import { collectNodes, computeUnions, generationDates, layoutPedigree } from './pedigree.js'

const dog = (id, name, extra = {}) => ({ id, name, geburtsdatum: null, mother_dog_id: null, father_dog_id: null, ...extra })

describe('layoutPedigree', () => {
  test('places children one generation below their parents', () => {
    const nodes = [
      dog(1, 'Aiko'),
      dog(2, 'Bella'),
      dog(3, 'Cora', { mother_dog_id: 2, father_dog_id: 1 }),
      dog(4, 'Emma', { mother_dog_id: 3 })
    ]
    const rows = layoutPedigree(nodes)
    expect(rows.map((r) => r.map((d) => d.name).sort())).toEqual([['Aiko', 'Bella'], ['Cora'], ['Emma']])
  })

  test('keeps children under their own parents to avoid crossings', () => {
    const nodes = [
      dog(1, 'A-Vater', { geburtsdatum: '2010-01-01' }),
      dog(2, 'B-Vater', { geburtsdatum: '2011-01-01' }),
      dog(3, 'Kind von B', { father_dog_id: 2, geburtsdatum: '2015-01-01' }),
      dog(4, 'Kind von A', { father_dog_id: 1, geburtsdatum: '2016-01-01' })
    ]
    const [parents, children] = layoutPedigree(nodes)
    const parentOrder = parents.map((d) => d.id)
    const childParentOrder = children.map((d) => d.father_dog_id)
    expect(childParentOrder).toEqual(parentOrder)
  })

  test('places a founder next to their mate instead of the top row', () => {
    const nodes = [
      dog(1, 'Shila'),
      dog(2, 'Ronja', { mother_dog_id: 1 }),
      dog(3, 'Kalle'),
      dog(4, 'Trude', { mother_dog_id: 2, father_dog_id: 3 }),
      dog(5, 'Bruno'),
      dog(6, 'Hermes', { mother_dog_id: 4, father_dog_id: 5 })
    ]
    const rows = layoutPedigree(nodes).map((r) => r.map((d) => d.name).sort())
    expect(rows).toEqual([['Shila'], ['Kalle', 'Ronja'], ['Bruno', 'Trude'], ['Hermes']])
  })

  test('survives cycles without hanging', () => {
    const nodes = [dog(1, 'A', { mother_dog_id: 2 }), dog(2, 'B', { mother_dog_id: 1 })]
    expect(layoutPedigree(nodes).flat()).toHaveLength(2)
  })

  test('returns no rows for an empty pack', () => {
    expect(layoutPedigree([])).toEqual([])
  })
})

describe('generationDates', () => {
  test('shows the shared birth date of a litter', () => {
    const litter = [dog(1, 'Hermes', { geburtsdatum: '2026-05-14' }), dog(2, 'Milo', { geburtsdatum: '2026-05-14' })]
    expect(generationDates(litter)).toBe('14.05.2026')
  })

  test('shows a year range for mixed births and ignores unknown dates', () => {
    const row = [dog(1, 'A', { geburtsdatum: '2017-06-18' }), dog(2, 'B'), dog(3, 'C', { geburtsdatum: '2020-04-09' })]
    expect(generationDates(row)).toBe('2017–2020')
    expect(generationDates([dog(4, 'D', { geburtsdatum: '2020-01-01' }), dog(5, 'E', { geburtsdatum: '2020-09-01' })])).toBe('2020')
  })

  test('returns null when no birth date is known', () => {
    expect(generationDates([dog(1, 'Shila')])).toBeNull()
  })
})

describe('collectNodes', () => {
  test('adds linked parents from other packs as external nodes above the child', () => {
    const own = [dog(1, 'Cora', { father_dog_id: 99 })]
    const all = [{ id: 99, name: 'Balu', familyName: 'Rudel B' }, { id: 1, name: 'Cora' }]
    const nodes = collectNodes(own, all)
    expect(nodes.find((n) => n.id === 99)).toMatchObject({ external: true, familyName: 'Rudel B' })

    const rows = layoutPedigree(nodes)
    expect(rows[0].map((d) => d.name)).toEqual(['Balu'])
    expect(rows[1].map((d) => d.name)).toEqual(['Cora'])
  })
})

describe('computeUnions', () => {
  test('groups litter mates under one parent pair', () => {
    const nodes = [
      dog(1, 'Aiko'),
      dog(2, 'Bella'),
      dog(3, 'Cora', { mother_dog_id: 2, father_dog_id: 1 }),
      dog(4, 'Dante', { mother_dog_id: 2, father_dog_id: 1 }),
      dog(5, 'Gustav', { father_dog_id: 4 })
    ]
    const unions = computeUnions(nodes)
    expect(unions).toEqual([
      { key: '2+1', parents: [2, 1], children: [3, 4] },
      { key: '4', parents: [4], children: [5] }
    ])
  })
})
