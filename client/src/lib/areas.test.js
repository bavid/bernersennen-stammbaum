import { describe, expect, test } from 'vitest'
import {
  HOME_LABEL,
  animalsRoute,
  familySettingsRoute,
  settingsArea,
  areaContext,
  groupRoute,
  inviteLabel,
  isEditable,
  isHouseholdIdentity,
  isPartnerArea,
  parseAreaId,
  startRoute
} from './areas.js'

const home = { id: 1, name: 'Zuhause am Deich', art: 'zuhause' }
const atHome = { ...home, home }
const inGroup = { id: 5, name: 'Familie Sonnenhang', art: 'rudel', home }
const visiting = { id: 9, name: 'Zuhause Möwenweg', art: 'zuhause', zuBesuch: true, home }
const classic = { id: 2, name: 'Rudel vom Heidekamp', art: 'rudel', home: { id: 2, art: 'rudel' } }

describe('areaContext (Phase W)', () => {
  test.each([
    ['eigenes Zuhause', atHome, 'home'],
    ['Haushalt in einer Familie', inGroup, 'group'],
    ['zu Besuch', visiting, 'visit'],
    ['klassischer Familien-Login', classic, 'classic'],
    ['Tierheim', { id: 7, art: 'tierheim', home: { id: 7, art: 'tierheim' } }, 'tierheim'],
    ['Partner', { id: 8, art: 'partner' }, 'partner'],
    ['ohne home: Zuhause', { art: 'zuhause' }, 'home'],
    ['ohne home: Rudel', { art: 'rudel' }, 'classic']
  ])('%s', (label, family, context) => {
    expect(areaContext(family)).toBe(context)
  })

  test('isHouseholdIdentity folgt der Identität, nicht dem aktiven Bereich', () => {
    expect([atHome, inGroup, visiting].every(isHouseholdIdentity)).toBe(true)
    expect(isHouseholdIdentity(classic)).toBe(false)
    expect(isHouseholdIdentity(undefined)).toBe(false)
  })
})

describe('startRoute', () => {
  test('Bestandsrudel mit Stammbaum-Start (klassischer Login) starten auf /stammbaum, Haushalte nicht', () => {
    expect(startRoute({ ...classic, stammbaumStart: true })).toBe('/stammbaum')
    expect(startRoute({ ...atHome, stammbaumStart: true })).toBe('/start')
  })

  test('das eigene Zuhause und klassische Logins starten auf /start', () => {
    expect(startRoute(atHome)).toBe('/start')
    expect(startRoute({ art: 'zuhause' })).toBe('/start')
    expect(startRoute(classic)).toBe('/start')
    expect(startRoute({ art: 'rudel' })).toBe('/start')
  })

  test('in einer Familie oder zu Besuch: deren Gruppenseite', () => {
    expect(startRoute(inGroup)).toBe('/familien/5')
    expect(startRoute(visiting)).toBe('/familien/9')
  })

  test('a shelter area starts at Profil like every partner area', () => {
    expect(startRoute({ art: 'tierheim' })).toBe('/profil')
  })

  test('a partner area (dog school, groomer, ...) starts at Profil', () => {
    expect(startRoute({ art: 'partner' })).toBe('/profil')
  })

  test('without a family falls back to /start', () => {
    expect(startRoute(undefined)).toBe('/start')
  })
})

describe('groupRoute und animalsRoute', () => {
  test('Gruppenseite mit und ohne Reiter', () => {
    expect(groupRoute(5)).toBe('/familien/5')
    expect(groupRoute(5, 'pinnwand')).toBe('/familien/5?reiter=pinnwand')
  })

  test('zurück zu den Tieren: /tiere oder der Reiter der Gruppenseite', () => {
    expect(animalsRoute(atHome)).toBe('/tiere')
    expect(animalsRoute(classic)).toBe('/tiere')
    expect(animalsRoute({ art: 'tierheim' })).toBe('/tiere')
    expect(animalsRoute(inGroup)).toBe('/familien/5?reiter=tiere')
    expect(animalsRoute(visiting)).toBe('/familien/9?reiter=tiere')
  })
})

describe('isPartnerArea', () => {
  test('is true for partner and shelter areas', () => {
    expect(isPartnerArea({ art: 'partner' })).toBe(true)
    expect(isPartnerArea({ art: 'tierheim' })).toBe(true)
  })

  test('is false for households, packs and no family', () => {
    expect(isPartnerArea({ art: 'zuhause' })).toBe(false)
    expect(isPartnerArea({ art: 'rudel' })).toBe(false)
    expect(isPartnerArea(null)).toBe(false)
  })
})

describe('inviteLabel', () => {
  test('partner and shelter areas pass on customer vouchers', () => {
    expect(inviteLabel({ art: 'partner' })).toBe('Einladungscode weitergeben')
    expect(inviteLabel({ art: 'tierheim' })).toBe('Einladungscode weitergeben')
  })

  // Phase W, Schritt 2: ein Haushalt lädt aus seinem Zuhause ein ("Einladen": Besuch oder Zuhause verschenken), der
  // klassische Login einer Familie lädt Mitglieder ein.
  test('households invite from their home, a classic family login invites members', () => {
    expect(inviteLabel({ art: 'zuhause' })).toBe('Einladen')
    expect(inviteLabel({ art: 'rudel', home: { id: 1, art: 'zuhause' } })).toBe('Einladen')
    expect(inviteLabel({ art: 'rudel', home: { id: 3, art: 'rudel' } })).toBe('Mitglied einladen')
    expect(inviteLabel(undefined)).toBe('Einladen')
  })
})

describe('HOME_LABEL', () => {
  test('is the fixed display name for the own household area', () => {
    expect(HOME_LABEL).toBe('Mein Zuhause')
  })
})

describe('isEditable', () => {
  test('is true for an own animal (can_edit: 1)', () => {
    expect(isEditable({ id: 1, can_edit: 1 })).toBe(true)
  })

  test('is false for a shared animal from another area (can_edit: 0)', () => {
    expect(isEditable({ id: 2, can_edit: 0 })).toBe(false)
  })

  test('treats a missing can_edit field as editable (lists that only ever return own animals)', () => {
    expect(isEditable({ id: 3 })).toBe(true)
  })
})

describe('parseAreaId (Phase W)', () => {
  test('accepts positive integers as number or digit string', () => {
    expect(parseAreaId(5)).toBe(5)
    expect(parseAreaId('12')).toBe(12)
  })

  test('rejects everything else', () => {
    for (const value of [0, -1, 1.5, '0', '-1', '1e3', '3abc', ' 3', '', null, undefined, '99999999999999999', {}]) {
      expect(parseAreaId(value), String(value)).toBeNull()
    }
  })
})

describe('Einstellungen › Familien › [Familie] (Phase W, Schritt 2)', () => {
  const me = { id: 1, art: 'zuhause', home: { id: 1, art: 'zuhause' }, memberships: [{ id: 3 }, { id: 4 }], besuche: [{ id: 9 }] }
  const params = (query) => new URLSearchParams(query)

  test('familySettingsRoute', () => {
    expect(familySettingsRoute(3)).toBe('/einstellungen?bereich=familien&familie=3')
  })

  test('nur eine eigene Mitgliedschaft schaltet dorthin, alles andere bleibt im eigenen Zuhause', () => {
    expect(settingsArea(me, params('bereich=familien&familie=3'))).toBe(3)
    expect(settingsArea(me, params('bereich=familien&familie=4'))).toBe(4)
    expect(settingsArea(me, params('bereich=familien&familie=9'))).toBe('home')
    expect(settingsArea(me, params('bereich=familien&familie=1'))).toBe('home')
    expect(settingsArea(me, params('bereich=familien&familie=3abc'))).toBe('home')
    expect(settingsArea(me, params('bereich=familien'))).toBe('home')
    expect(settingsArea(me, params('bereich=zuhause&familie=3'))).toBe('home')
    expect(settingsArea(me, params(''))).toBe('home')
  })
})
