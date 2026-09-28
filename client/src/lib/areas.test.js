import { describe, expect, test } from 'vitest'
import { HOME_LABEL, isEditable, isPartnerArea, startRoute } from './areas.js'

describe('startRoute', () => {
  test('a household area starts at Wegbegleiter', () => {
    expect(startRoute({ art: 'zuhause' })).toBe('/wegbegleiter')
  })

  test('a group/pack area starts at Stammbaum', () => {
    expect(startRoute({ art: 'rudel' })).toBe('/stammbaum')
  })

  test('a shelter area starts at Tiere', () => {
    expect(startRoute({ art: 'tierheim' })).toBe('/tiere')
  })

  test('a partner area (dog school, groomer, ...) starts at Profil', () => {
    expect(startRoute({ art: 'partner' })).toBe('/profil')
  })

  test('without a family (e.g. classic pack login without art) falls back to Stammbaum', () => {
    expect(startRoute(undefined)).toBe('/stammbaum')
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

describe('HOME_LABEL', () => {
  test('is the fixed display name for the own household area', () => {
    expect(HOME_LABEL).toBe('Meine Chronik')
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
