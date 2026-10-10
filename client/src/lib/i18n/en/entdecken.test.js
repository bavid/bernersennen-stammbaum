import { describe, expect, test } from 'vitest'
import entdecken from './entdecken.js'
import en from './index.js'

// Öffentliches Entdecken: jedes Wort übersetzt, keine Umlaute im Englischen, und die Datei hängt im Wörterbuch.
describe('Englisch: öffentliches Entdecken', () => {
  test('Wörterbuch ohne leere oder vergessene Übersetzungen', () => {
    for (const [key, value] of Object.entries(entdecken)) {
      expect(typeof value === 'string' && value.trim().length > 0, key).toBe(true)
      expect(value, key).not.toMatch(/[äöüÄÖÜß]/)
      expect(en[key], key).toBe(value)
    }
  })

  test('Wortwahl: nie „ohne Werbung“, sondern keine fremde Werbung, kein Tracking, kein Datenhandel', () => {
    const lede = Object.keys(entdecken).find((key) => key.startsWith('Hier findet ihr'))
    expect(lede).toMatch(/Keine fremde Werbung, kein Tracking, kein Datenhandel\.$/)
    expect(Object.keys(entdecken).join(' ')).not.toMatch(/ohne Werbung|für immer|vorerst/)
  })
})
