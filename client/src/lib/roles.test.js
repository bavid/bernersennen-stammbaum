import { describe, expect, test } from 'vitest'
import { ROLES, hasRole, inviteRoleOptions, isLastLeitung, rank, roleLabel, roleOf } from './roles.js'
import { getTheme } from '../themes/index.js'

const home = { id: 1, name: 'Zuhause am Deich', art: 'zuhause' }
const inGroup = (role) => ({ id: 3, name: 'Familie Sonnenhang', art: 'rudel', role, home })

describe('rank / roleOf', () => {
  test('ranks ascend gast < mitglied < stellvertretung < leitung, unknown values fall below gast', () => {
    expect(ROLES).toEqual(['gast', 'mitglied', 'stellvertretung', 'leitung'])
    expect(rank('gast')).toBeLessThan(rank('mitglied'))
    expect(rank('mitglied')).toBeLessThan(rank('stellvertretung'))
    expect(rank('stellvertretung')).toBeLessThan(rank('leitung'))
    expect(rank(undefined)).toBe(-1)
    expect(rank('chef')).toBe(-1)
  })

  test('own areas (zuhause, tierheim, partner) are leitung when the server sends no role', () => {
    expect(roleOf({ id: 1, art: 'zuhause', home })).toBe('leitung')
    expect(roleOf({ id: 5, art: 'tierheim' })).toBe('leitung')
    expect(roleOf({ id: 6, art: 'partner' })).toBe('leitung')
  })

  test('a role sent by the server is authoritative, even outside a family (fail closed)', () => {
    expect(roleOf({ id: 5, art: 'tierheim', role: 'gast' })).toBe('gast')
    expect(roleOf({ id: 3, art: 'rudel', role: 'mitglied', home: { id: 3, art: 'rudel' } })).toBe('mitglied')
  })

  test('a classic shared-key session (identity is the family itself) counts as leitung', () => {
    expect(roleOf({ id: 3, art: 'rudel', home: { id: 3, art: 'rudel' } })).toBe('leitung')
  })

  test('inside a family the membership role counts; unknown or missing roles give no rights', () => {
    expect(roleOf(inGroup('mitglied'))).toBe('mitglied')
    expect(roleOf(inGroup('gast'))).toBe('gast')
    expect(roleOf(inGroup(undefined))).toBeNull()
    expect(roleOf(inGroup('chef'))).toBeNull()
    expect(roleOf(null)).toBeNull()
  })
})

describe('hasRole', () => {
  test('compares by rank', () => {
    expect(hasRole(inGroup('gast'), 'gast')).toBe(true)
    expect(hasRole(inGroup('gast'), 'mitglied')).toBe(false)
    expect(hasRole(inGroup('mitglied'), 'mitglied')).toBe(true)
    expect(hasRole(inGroup('mitglied'), 'stellvertretung')).toBe(false)
    expect(hasRole(inGroup('stellvertretung'), 'stellvertretung')).toBe(true)
    expect(hasRole(inGroup('stellvertretung'), 'leitung')).toBe(false)
    expect(hasRole(inGroup('leitung'), 'leitung')).toBe(true)
  })

  test('without a role nothing is allowed, not even gast', () => {
    expect(hasRole(inGroup(undefined), 'gast')).toBe(false)
    expect(hasRole(undefined, 'gast')).toBe(false)
  })

  test('in the own home everything is allowed', () => {
    expect(hasRole({ id: 1, art: 'zuhause', home }, 'leitung')).toBe(true)
  })
})

describe('roleLabel', () => {
  test('berner and standard name the roles differently, both cover every role', () => {
    const berner = getTheme('berner').words
    const standard = getTheme('standard').words
    expect(ROLES.map((rolle) => roleLabel(berner, rolle))).toEqual(['Gast', 'Mitglied', 'Stellvertretung', 'Rudelführer'])
    expect(ROLES.map((rolle) => roleLabel(standard, rolle))).toEqual(['Gast', 'Mitglied', 'Stellvertretung', 'Familienleitung'])
  })

  test('unknown roles have no label', () => {
    expect(roleLabel(getTheme('standard').words, undefined)).toBeNull()
    expect(roleLabel(getTheme('standard').words, 'chef')).toBeNull()
  })
})

describe('inviteRoleOptions', () => {
  test('leitung may invite with any role, stellvertretung only gast/mitglied, others not at all', () => {
    expect(inviteRoleOptions('leitung')).toEqual(ROLES)
    expect(inviteRoleOptions('stellvertretung')).toEqual(['gast', 'mitglied'])
    expect(inviteRoleOptions('mitglied')).toEqual([])
    expect(inviteRoleOptions('gast')).toEqual([])
    expect(inviteRoleOptions(null)).toEqual([])
  })
})

describe('isLastLeitung', () => {
  const list = [
    { familyId: 1, rolle: 'leitung' },
    { familyId: 2, rolle: 'mitglied' }
  ]

  test('true only for a leitung when no second leitung exists', () => {
    expect(isLastLeitung(list[0], list)).toBe(true)
    expect(isLastLeitung(list[1], list)).toBe(false)
    expect(isLastLeitung(list[0], [...list, { familyId: 3, rolle: 'leitung' }])).toBe(false)
    expect(isLastLeitung(undefined, list)).toBe(false)
  })
})
