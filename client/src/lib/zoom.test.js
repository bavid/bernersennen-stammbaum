import { describe, expect, test } from 'vitest'
import { anchoredScroll, clampZoom, fitZoom, MAX_ZOOM, MIN_ZOOM, zoomIn, zoomOut } from './zoom.js'

describe('tree zoom', () => {
  test('stays within its limits', () => {
    expect(clampZoom(10)).toBe(MAX_ZOOM)
    expect(clampZoom(0.01)).toBe(MIN_ZOOM)
    expect(clampZoom(Number.NaN)).toBe(1)
  })

  test('zooms in and out in steps and comes back to 100 %', () => {
    expect(zoomIn(1)).toBe(1.2)
    expect(zoomOut(zoomIn(1))).toBe(1)
    expect(zoomIn(MAX_ZOOM)).toBe(MAX_ZOOM)
  })

  test('fit shrinks a wide tree to the available width but never enlarges it', () => {
    expect(fitZoom({ width: 2000, height: 800 }, { width: 1000 })).toBe(0.5)
    expect(fitZoom({ width: 600, height: 800 }, { width: 1000 })).toBe(1)
    expect(fitZoom({ width: 1000, height: 2000 }, { width: 1000, height: 800 })).toBe(0.4)
    expect(fitZoom({ width: 9000, height: 100 }, { width: 900 })).toBe(MIN_ZOOM)
  })

  test('fit rounds down so the tree never ends up a few pixels too wide', () => {
    expect(fitZoom({ width: 1644, height: 700 }, { width: 1342 })).toBe(0.81)
  })

  test('keeps the point under the mouse in place while zooming', () => {
    // Punkt 300 px rechts vom Rand bei scrollLeft 100 und 32 px Innenabstand, Zoom 1 -> 2
    const next = anchoredScroll({ scroll: 100, anchor: 300, pad: 32, from: 1, to: 2 })
    const pointBefore = (100 + 300 - 32) / 1
    const pointAfter = (next + 300 - 32) / 2
    expect(pointAfter).toBeCloseTo(pointBefore)
  })
})
