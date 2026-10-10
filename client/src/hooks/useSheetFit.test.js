import { describe, expect, test } from 'vitest'
import { SHEET_WIDTH_PX, sheetScale } from './useSheetFit.js'

describe('sheetScale – A4-Vorschau passt in schmale Bildschirme', () => {
  test('am Handy (359 px) wird der Bogen auf die Breite verkleinert', () => {
    const scale = sheetScale(359)
    expect(scale).toBeLessThan(0.46)
    expect(scale * SHEET_WIDTH_PX).toBeLessThanOrEqual(359)
  })

  test('breit genug: nie größer als 1', () => {
    expect(sheetScale(1200)).toBe(1)
    expect(sheetScale(SHEET_WIDTH_PX)).toBe(1)
  })

  test('ohne gemessene Breite bleibt es bei 1', () => {
    expect(sheetScale(0)).toBe(1)
    expect(sheetScale(undefined)).toBe(1)
  })
})
