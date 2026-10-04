import { describe, expect, test } from 'vitest'
import { accountInitial, accountMenuItems, accountName, canInvite } from './accountMenu.js'

const home = { id: 1, name: 'Zuhause Lindenhof', art: 'zuhause' }
const atHome = { ...home, home, role: 'leitung' }
const keys = (family) => accountMenuItems(family).map((item) => item.key)

describe('accountMenuItems (Phase W)', () => {
  test('eigenes Zuhause: alles', () => {
    expect(keys(atHome)).toEqual(['einstellungen', 'einladen', 'collage', 'hilfe', 'abmelden'])
  })

  test('in einer Familie: Einladen erst ab Stellvertretung', () => {
    expect(keys({ ...atHome, id: 5, art: 'rudel', role: 'mitglied' })).toEqual(['einstellungen', 'collage', 'hilfe', 'abmelden'])
    expect(keys({ ...atHome, id: 5, art: 'rudel', role: 'stellvertretung' })).toContain('einladen')
  })

  test('zu Besuch: kein Einladen', () => {
    expect(keys({ ...atHome, id: 9, zuBesuch: true, role: 'gast' })).toEqual(['einstellungen', 'collage', 'hilfe', 'abmelden'])
  })

  test('klassischer Familien-Login: zusätzlich Mitglieder', () => {
    const classic = { id: 2, name: 'Rudel vom Heidekamp', art: 'rudel', role: 'leitung', home: { id: 2, name: 'Rudel vom Heidekamp', art: 'rudel' } }
    expect(keys(classic)).toEqual(['einstellungen', 'einladen', 'collage', 'mitglieder', 'hilfe', 'abmelden'])
    expect(accountMenuItems(classic).find((item) => item.key === 'mitglieder').to).toBe('/mitglieder')
  })

  test('Name und Anfangsbuchstabe', () => {
    expect(accountName({ ...atHome, id: 5, name: 'Familie Sonnenhang' })).toBe('Zuhause Lindenhof')
    expect(accountName({ name: 'Rudel vom Heidekamp' })).toBe('Rudel vom Heidekamp')
    expect(accountInitial('Zuhause Lindenhof (Demo)')).toBe('L')
    expect(accountInitial('Zuhause am Deich')).toBe('Z')
    expect(accountInitial('')).toBe('?')
    expect(canInvite(null)).toBe(false)
  })
})
