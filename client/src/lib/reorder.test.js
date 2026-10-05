import { describe, expect, test } from 'vitest'
import { indexFromPoint, moveItem, stepIndex } from './reorder.js'

describe('moveItem', () => {
  test('verschiebt nach vorn und nach hinten, ohne das Original zu ändern', () => {
    const list = ['a', 'b', 'c', 'd']
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItem(list, 3, 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(list).toEqual(['a', 'b', 'c', 'd'])
  })

  test('gleiche oder ungültige Stellen lassen die Liste unverändert', () => {
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], -1, 1)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b'])
    expect(moveItem(null, 0, 1)).toEqual([])
  })
})

describe('indexFromPoint', () => {
  const rects = [
    { left: 0, top: 0, right: 100, bottom: 100 },
    null,
    { left: 100, top: 0, right: 200, bottom: 100 }
  ]

  test('findet das Rechteck unter dem Punkt, Ränder zählen links/oben dazu', () => {
    expect(indexFromPoint(rects, 10, 10)).toBe(0)
    expect(indexFromPoint(rects, 100, 50)).toBe(2)
    expect(indexFromPoint(rects, 99.9, 50)).toBe(0)
  })

  test('daneben ist null', () => {
    expect(indexFromPoint(rects, 250, 50)).toBe(null)
    expect(indexFromPoint([], 0, 0)).toBe(null)
  })
})

describe('stepIndex', () => {
  test('Pfeile um eins, begrenzt; Pos1/Ende an den Rand; andere Tasten null', () => {
    expect(stepIndex('ArrowRight', 0, 3)).toBe(1)
    expect(stepIndex('ArrowDown', 2, 3)).toBe(2)
    expect(stepIndex('ArrowLeft', 0, 3)).toBe(0)
    expect(stepIndex('ArrowUp', 2, 3)).toBe(1)
    expect(stepIndex('Home', 2, 3)).toBe(0)
    expect(stepIndex('End', 0, 3)).toBe(2)
    expect(stepIndex('Tab', 1, 3)).toBe(null)
  })
})
