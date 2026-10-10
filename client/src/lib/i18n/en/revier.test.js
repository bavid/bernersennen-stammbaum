import { describe, expect, test } from 'vitest'
import revier from './revier.js'
import en from './index.js'

// Phase M „Mein Revier“: jedes Wort übersetzt, keine Umlaute im Englischen, und die Datei hängt im Wörterbuch.
describe('Englisch: Mein Revier', () => {
  test('Wörterbuch ohne leere oder vergessene Übersetzungen', () => {
    for (const [key, value] of Object.entries(revier)) {
      expect(typeof value === 'string' && value.trim().length > 0, key).toBe(true)
      expect(value, key).not.toMatch(/[äöüÄÖÜß]/)
      expect(en[key], key).toBeTruthy()
    }
    expect(en['Mein Revier']).toBe('My neighbourhood')
  })
})
