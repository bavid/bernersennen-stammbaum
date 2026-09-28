import { describe, expect, test } from 'vitest'
import { HOME_LABEL, isEditable, startRoute } from './areas.js'

describe('startRoute', () => {
  test('a household area starts at Wegbegleiter', () => {
    expect(startRoute({ art: 'zuhause' })).toBe('/wegbegleiter')
  })

  test('a group/pack area starts at Stammbaum', () => {
    expect(startRoute({ art: 'rudel' })).toBe('/stammbaum')
  })

  test('without a family (e.g. classic pack login without art) falls back to Stammbaum', () => {
    expect(startRoute(undefined)).toBe('/stammbaum')
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
