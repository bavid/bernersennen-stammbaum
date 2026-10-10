// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'
import Chip, { CHIP_TONES } from './Chip.jsx'
import { render } from './renderForTest.js'

describe('Chip', () => {
  test('neutral ohne Ton-Klasse', () => {
    expect(render(<Chip>Entwurf</Chip>).className).toBe('ui-chip')
  })

  test('jeder Ton wird zur Klasse, der Text bleibt sichtbar (Farbe nie allein)', () => {
    for (const tone of CHIP_TONES.filter((value) => value !== 'neutral')) {
      const chip = render(<Chip tone={tone}>Stand</Chip>)
      expect(chip.className).toBe(`ui-chip ui-chip--${tone}`)
      expect(chip.textContent).toBe('Stand')
    }
  })

  test('unbekannter Ton wird neutral; Icon ist für Screenreader verborgen', () => {
    const chip = render(
      <Chip tone="lila" icon="check">
        Frei
      </Chip>
    )
    expect(chip.className).toBe('ui-chip')
    expect(chip.querySelector('svg').getAttribute('aria-hidden')).toBe('true')
  })
})
