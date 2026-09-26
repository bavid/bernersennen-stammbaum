import { describe, expect, test } from 'vitest'
import { householdPath, RAIL_DROP } from './pedigreeLines.js'

const box = (cx, bottom = 50) => ({ cx, bottom })

describe('householdPath', () => {
  test('draws one bracket under all members with a stub for each', () => {
    const { d, icon } = householdPath([box(300), box(100), box(500)])
    const rail = 50 + RAIL_DROP
    expect(d.startsWith('M100,50 ')).toBe(true)
    expect(d).toContain(`H${500 - 8}`)
    expect(d).toContain(`M300,50 V${rail}`)
    expect(icon).toEqual({ x: 200, y: rail })
  })

  test('two members: the house sits in the middle of the rail', () => {
    const { icon } = householdPath([box(100), box(340, 46)])
    expect(icon).toEqual({ x: 220, y: 50 + RAIL_DROP })
  })

  test('the rail hangs below the lowest card', () => {
    const { icon } = householdPath([box(100, 40), box(300, 70)])
    expect(icon.y).toBe(70 + RAIL_DROP)
  })
})
