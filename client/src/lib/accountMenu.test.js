import { describe, expect, test } from 'vitest'
import { accountInitial, accountMenuItems, accountName, canInvite } from './accountMenu.js'

const home = { id: 1, name: 'Zuhause Lindenhof', art: 'zuhause' }
const atHome = { ...home, home, role: 'leitung' }
const keys = (family) => accountMenuItems(family).map((item) => item.key)

describe('accountMenuItems (Phase W)', () => {
  test('eigenes Zuhause: alles', () => {
    expect(keys(atHome)).toEqual(['einstellungen', 'einladen', 'collage', 'hilfe', 'abmelden'])
  })

  // Phase W, Schritt 2: "Einladen" im Menü ist immer das Einladen des eigenen Zuhauses (App.jsx wechselt dafür nach Hause) -
  // Mitglieder einer Familie lädt man im Reiter "Mitglieder" ein.
  test('in einer Familie und zu Besuch: Einladen für jeden Haushalt (das eigene Zuhause lädt ein)', () => {
    expect(keys({ ...atHome, id: 5, art: 'rudel', role: 'mitglied' })).toEqual(['einstellungen', 'einladen', 'collage', 'hilfe', 'abmelden'])
    expect(keys({ ...atHome, id: 9, zuBesuch: true, role: 'gast' })).toEqual(['einstellungen', 'einladen', 'collage', 'hilfe', 'abmelden'])
  })

  test('klassischer Familien-Login: Einladen erst ab Stellvertretung', () => {
    const classic = { id: 2, name: 'Rudel vom Heidekamp', art: 'rudel', role: 'mitglied', home: { id: 2, name: 'Rudel vom Heidekamp', art: 'rudel' } }
    expect(keys(classic)).not.toContain('einladen')
    expect(keys({ ...classic, role: 'stellvertretung' })).toContain('einladen')
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
