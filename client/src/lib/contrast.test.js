import { describe, expect, test } from 'vitest'
import { contrastRatio, hasEnoughContrast, ON_RUST, MIN_CONTRAST } from './contrast.js'

// Spiegelt server/lib/partners.js (contrastRatio, ON_RUST, MIN_CONTRAST) fürs Live-Feedback im
// Admin-Formular (AdminPartners) - dieselben Beispiele wie server/test/partners.test.js.
describe('contrastRatio', () => {
  test('gleiche Farbe gegen sich selbst ergibt 1:1', () => {
    expect(contrastRatio('#fffaf2', '#fffaf2')).toBeCloseTo(1, 5)
  })

  test('Schwarz gegen Weiß ergibt ~21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
  })

  test('ist symmetrisch (Reihenfolge der Farben egal)', () => {
    expect(contrastRatio('#2f6b3f', ON_RUST)).toBeCloseTo(contrastRatio(ON_RUST, '#2f6b3f'), 10)
  })
})

describe('hasEnoughContrast', () => {
  test('#2f6b3f (Demo-Grün) hat genug Kontrast gegen --on-rust', () => {
    expect(hasEnoughContrast('#2f6b3f')).toBe(true)
  })

  test('#fffaf2 (== ON_RUST) hat zu wenig Kontrast gegen sich selbst', () => {
    expect(hasEnoughContrast('#fffaf2')).toBe(false)
    expect(contrastRatio('#fffaf2', ON_RUST)).toBeLessThan(MIN_CONTRAST)
  })

  test('eine helle Pastellfarbe reißt die Mindestschwelle', () => {
    expect(hasEnoughContrast('#ffe0b2')).toBe(false)
  })
})
