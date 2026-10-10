// @vitest-environment jsdom
import { afterEach, describe, expect, test } from 'vitest'
import { centerSquare, personName, rememberPersonName, withAreaBild } from './profil.js'
import { readSetting, removeSetting, writeSetting } from './storage.js'

afterEach(() => removeSetting('autorName'))

describe('profil', () => {
  test('personName liest person.anzeigename aus /me, sonst leer', () => {
    expect(personName({ person: { anzeigename: 'Anke' } })).toBe('Anke')
    expect(personName({ person: { anzeigename: null } })).toBe('')
    expect(personName(null)).toBe('')
  })

  test('rememberPersonName macht den Namen zur Vorgabe für neue Erinnerungen', () => {
    writeSetting('autorName', 'Alter Name')
    rememberPersonName({ person: { anzeigename: 'Anke' } })
    expect(readSetting('autorName', '')).toBe('Anke')
  })

  test('ohne gespeicherten Namen bleibt der gemerkte Name des Geräts', () => {
    writeSetting('autorName', 'Jonas')
    rememberPersonName({ person: { anzeigename: null } })
    expect(readSetting('autorName', '')).toBe('Jonas')
  })

  test('centerSquare schneidet gleichmäßig aus der Mitte', () => {
    expect(centerSquare(400, 300)).toEqual({ sx: 50, sy: 0, side: 300 })
    expect(centerSquare(300, 500)).toEqual({ sx: 0, sy: 100, side: 300 })
    expect(centerSquare(200, 200)).toEqual({ sx: 0, sy: 0, side: 200 })
  })

  test('withAreaBild setzt das Bild überall, wo der Bereich in /me steht', () => {
    const me = { id: 3, bild: null, home: { id: 1, bild: null }, memberships: [{ id: 3, bild: null }, { id: 4, bild: '/x' }] }
    const next = withAreaBild(me, 3, '/neu')
    expect(next.bild).toBe('/neu')
    expect(next.home.bild).toBeNull()
    expect(next.memberships.map((m) => m.bild)).toEqual(['/neu', '/x'])
    expect(withAreaBild(me, 1, '/h').home.bild).toBe('/h')
    expect(me.bild).toBeNull()
  })
})
