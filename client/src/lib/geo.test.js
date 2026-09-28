import { describe, expect, test } from 'vitest'
import { roundCoord } from './geo.js'

describe('roundCoord', () => {
  test('rundet auf 0,01 Grad (~1 km) – nie den genauen Standort weitergeben', () => {
    expect(roundCoord(52.523406)).toBeCloseTo(52.52, 5)
    expect(roundCoord(13.411899)).toBeCloseTo(13.41, 5)
  })

  test('erlaubt einen anderen Rundungsschritt', () => {
    expect(roundCoord(52.523406, 0.1)).toBeCloseTo(52.5, 5)
  })
})
