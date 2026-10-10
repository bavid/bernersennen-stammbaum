import { describe, expect, test } from 'vitest'
import banner from './banner.js'
import { setLang, t } from '../index.js'
import { BANNER_CHIPS, BANNER_TEXT_MAX } from '../../communityBannerAdmin.js'

describe('Englisch: Band „Mit dabei“', () => {
  test('Wörterbuch ohne leere Übersetzungen; Schalter und Meldungen haben eine englische Fassung', () => {
    for (const [key, value] of Object.entries(banner)) expect(typeof value === 'string' && value.trim().length > 0, key).toBe(true)
    setLang('en')
    try {
      // „Partner“ heißt auf Englisch genauso.
      for (const chip of BANNER_CHIPS.filter((c) => c.label !== 'Partner')) expect(t(chip.label), chip.label).not.toBe(chip.label)
      expect(t(`Höchstens ${BANNER_TEXT_MAX} Zeichen.`)).toBe('At most 80 characters.')
      expect(t('{n} Fotos', { n: 3 })).toBe('3 photos')
    } finally {
      setLang('de')
    }
  })
})
