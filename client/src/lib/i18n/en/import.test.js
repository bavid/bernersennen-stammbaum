import { describe, expect, test } from 'vitest'
import fotoImport from './import.js'
import { setLang, t } from '../index.js'
import { IMPORT_TEXT } from '../../fotoImport/texts.js'

describe('Englisch: Fotos mitbringen', () => {
  test('jeder Text hat eine englische Fassung', () => {
    for (const [key, value] of Object.entries(fotoImport)) expect(typeof value === 'string' && value.trim().length > 0, key).toBe(true)
    setLang('en')
    try {
      for (const text of Object.values(IMPORT_TEXT)) expect(t(text), text).not.toBe(text)
      expect(t(IMPORT_TEXT.dayTitle, { date: '1 April 2024' })).toBe('Photos from 1 April 2024')
      expect(t(IMPORT_TEXT.summary, { photos: 3, days: 2 })).toBe('3 photos · 2 memories')
    } finally {
      setLang('de')
    }
  })
})
