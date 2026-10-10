import { describe, expect, test } from 'vitest'
import fotoImport from './import.js'
import { setLang, t } from '../index.js'
import { IMPORT_COUNT, IMPORT_TEXT, countText } from '../../fotoImport/texts.js'

describe('Englisch: Fotos mitbringen', () => {
  test('jeder Text hat eine englische Fassung', () => {
    for (const [key, value] of Object.entries(fotoImport)) expect(typeof value === 'string' && value.trim().length > 0, key).toBe(true)
    setLang('en')
    try {
      for (const text of Object.values(IMPORT_TEXT)) expect(t(text), text).not.toBe(text)
      for (const text of Object.values(IMPORT_COUNT).flat()) expect(t(text), text).not.toBe(text)
      expect(t(IMPORT_TEXT.dayTitle, { date: '1 April 2024' })).toBe('Photos from 1 April 2024')
    } finally {
      setLang('de')
    }
  })

  // E2E 2026-10-10: „2 Fotos · 1 Erinnerungen“ bzw. „1 memories“ - Einzahl bei genau einem.
  test('Anzahlen stehen bei genau einem in der Einzahl', () => {
    const count = (pair, n, extra = {}) => t(countText(pair, n), { n, ...extra })
    expect(count(IMPORT_COUNT.photos, 1)).toBe('1 Foto')
    expect(count(IMPORT_COUNT.photos, 3)).toBe('3 Fotos')
    expect(count(IMPORT_COUNT.memories, 1)).toBe('1 Erinnerung')
    expect(count(IMPORT_COUNT.memories, 2)).toBe('2 Erinnerungen')
    expect(count(IMPORT_COUNT.dayGroup, 1, { date: '1. April' })).toBe('1. April · 1 Foto')
    expect(count(IMPORT_COUNT.done, 1)).toBe('1 Erinnerung angelegt.')
    setLang('en')
    try {
      expect(count(IMPORT_COUNT.photos, 1)).toBe('1 photo')
      expect(count(IMPORT_COUNT.memories, 1)).toBe('1 memory')
      expect(count(IMPORT_COUNT.memories, 2)).toBe('2 memories')
      expect(count(IMPORT_COUNT.dayGroup, 1, { date: '1 April' })).toBe('1 April · 1 photo')
      expect(count(IMPORT_COUNT.cancelled, 1)).toBe('Cancelled. 1 memory was already created and stays.')
    } finally {
      setLang('de')
    }
  })
})
