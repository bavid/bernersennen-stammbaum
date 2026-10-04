import { describe, expect, test } from 'vitest'
import { originLabel, sharedInHint } from './tierZuhause.js'

const family = { id: 5, name: 'Familie Sonnenhang', art: 'familie' }
const visit = { id: 8, name: 'Zuhause Möwenweg', art: 'besuch' }

describe('lib/tierZuhause: wo ein Tier wohnt', () => {
  test('originLabel: „aus …“ mit dem Zuhause des Tiers, das eigene (kein Zuhause) ohne', () => {
    expect(originLabel('Zuhause Möwenweg')).toBe('aus Zuhause Möwenweg')
    expect(originLabel('Familie Sonnenhang')).toBe('aus Familie Sonnenhang')
    expect(originLabel(null)).toBeNull()
    expect(originLabel(undefined)).toBeNull()
    expect(originLabel('')).toBeNull()
  })

  test('sharedInHint: nur für Familien, über die ein Tier eines anderen Zuhauses zu sehen ist', () => {
    expect(sharedInHint('Zuhause Möwenweg', family)).toBe('geteilt in Familie Sonnenhang')
    expect(sharedInHint('Familie Sonnenhang', family)).toBeNull()
    expect(sharedInHint('Zuhause Möwenweg', visit)).toBeNull()
    expect(sharedInHint(null, family)).toBeNull()
    expect(sharedInHint('Zuhause Möwenweg', undefined)).toBeNull()
    expect(sharedInHint('Zuhause Möwenweg', { art: 'familie' })).toBeNull()
  })
})
