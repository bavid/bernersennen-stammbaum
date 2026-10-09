// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { MAX_KONTAKT_LENGTH, clearKontakt, loadKontakt, saveKontakt } from './kontaktDefaults.js'

const KEY = 'chronik.kontakt'

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('kontaktDefaults', () => {
  test('gibt leere Angaben zurück, wenn nichts gespeichert ist', () => {
    expect(loadKontakt()).toEqual({})
  })

  test('speichert und lädt Name, E-Mail und Telefon', () => {
    saveKontakt({ name: ' Anna ', email: 'anna@example.org', telefon: '040 1' })
    expect(loadKontakt()).toEqual({ name: 'Anna', email: 'anna@example.org', telefon: '040 1' })
  })

  test('speichert nie Nachricht, Passwort oder Code', () => {
    saveKontakt({ name: 'A', nachricht: 'geheim', password: 'x', code: '123' })
    expect(JSON.parse(window.localStorage.getItem(KEY))).toEqual({ name: 'A' })
  })

  test('ignoriert kaputtes JSON und falsche Formen', () => {
    window.localStorage.setItem(KEY, '{kaputt')
    expect(loadKontakt()).toEqual({})
    window.localStorage.setItem(KEY, JSON.stringify(['x']))
    expect(loadKontakt()).toEqual({})
    window.localStorage.setItem(KEY, JSON.stringify({ name: 5, email: 'a@b.de', nachricht: 'x' }))
    expect(loadKontakt()).toEqual({ email: 'a@b.de' })
  })

  test('kürzt zu lange Texte', () => {
    saveKontakt({ name: 'x'.repeat(MAX_KONTAKT_LENGTH + 50) })
    expect(loadKontakt().name).toHaveLength(MAX_KONTAKT_LENGTH)
  })

  test('behält bestehende Felder, wenn nur ein Teil gespeichert wird', () => {
    saveKontakt({ name: 'Anna', email: 'a@b.de' })
    saveKontakt({ telefon: '123' })
    expect(loadKontakt()).toEqual({ name: 'Anna', email: 'a@b.de', telefon: '123' })
  })

  test('clearKontakt vergisst alles', () => {
    saveKontakt({ name: 'Anna' })
    clearKontakt()
    expect(loadKontakt()).toEqual({})
  })

  test('läuft ohne Speicher weiter, ohne zu werfen', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('gesperrt')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('gesperrt')
    })
    expect(loadKontakt()).toEqual({})
    expect(() => saveKontakt({ name: 'A' })).not.toThrow()
    expect(() => clearKontakt()).not.toThrow()
  })
})
