import { describe, expect, test } from 'vitest'
import { darkenHex, hexToRgba, isValidHexColor } from './color.js'

describe('isValidHexColor', () => {
  test('akzeptiert #rrggbb', () => {
    expect(isValidHexColor('#2f6b3f')).toBe(true)
    expect(isValidHexColor('#ABCDEF')).toBe(true)
  })

  test('lehnt alles andere ab – nie ein Style-Injektionsrisiko durchlassen', () => {
    expect(isValidHexColor('red')).toBe(false)
    expect(isValidHexColor('#fff')).toBe(false)
    expect(isValidHexColor('#gggggg')).toBe(false)
    expect(isValidHexColor('expression(alert(1))')).toBe(false)
    expect(isValidHexColor(null)).toBe(false)
    expect(isValidHexColor(undefined)).toBe(false)
  })
})

describe('darkenHex', () => {
  test('liefert eine dunklere, aber gültige Hex-Farbe', () => {
    const darker = darkenHex('#2f6b3f')
    expect(isValidHexColor(darker)).toBe(true)
    expect(darker).not.toBe('#2f6b3f')
  })

  test('wird nie heller als der Ausgang (Lightness sinkt)', () => {
    const toL = (hex) => {
      const n = parseInt(hex.slice(1), 16)
      const r = (n >> 16) & 255
      const g = (n >> 8) & 255
      const b = n & 255
      return (Math.max(r, g, b) + Math.min(r, g, b)) / 2
    }
    expect(toL(darkenHex('#a4431d'))).toBeLessThan(toL('#a4431d'))
  })
})

describe('hexToRgba', () => {
  test('wandelt in einen rgba()-String mit dem gegebenen Alpha-Wert', () => {
    expect(hexToRgba('#a4431d', 0.1)).toBe('rgba(164, 67, 29, 0.1)')
  })
})
