import { describe, expect, test } from 'vitest'
import { isBoundPartnerAccess, partnerAccessFrom, partnerSetupPayload, validatePartnerSetup } from './partnerSetup.js'

describe('partnerAccessFrom', () => {
  test('returns the partner-access info for zweck "partnerzugang"', () => {
    expect(partnerAccessFrom({ status: 'offen', zweck: 'partnerzugang', partnerTyp: 'hundeschule' })).toEqual({
      partnerTyp: 'hundeschule',
      partnerName: null
    })
  })

  test('returns null for customer vouchers and missing results', () => {
    expect(partnerAccessFrom({ status: 'offen' })).toBeNull()
    expect(partnerAccessFrom(null)).toBeNull()
  })
})

describe('isBoundPartnerAccess', () => {
  test('is true only when the code is bound to an existing partner (partnerName)', () => {
    expect(isBoundPartnerAccess({ partnerTyp: 'hundeschule', partnerName: 'Hundeschule Wiesengrund' })).toBe(true)
    expect(isBoundPartnerAccess({ partnerTyp: 'hundeschule', partnerName: null })).toBe(false)
    expect(isBoundPartnerAccess(null)).toBe(false)
  })
})

describe('validatePartnerSetup', () => {
  const access = { partnerTyp: null, partnerName: null }

  test('accepts name, typ and a five-digit PLZ', () => {
    expect(validatePartnerSetup({ name: 'Hundeschule Wiesengrund', typ: 'hundeschule', plz: '10115' }, access)).toEqual({})
  })

  test('requires a name (whitespace does not count)', () => {
    expect(validatePartnerSetup({ name: '   ', typ: 'hundeschule', plz: '10115' }, access)).toHaveProperty('name')
  })

  test('requires a typ unless it is preset', () => {
    expect(validatePartnerSetup({ name: 'Wiesengrund', typ: '', plz: '10115' }, access)).toHaveProperty('typ')
    expect(validatePartnerSetup({ name: 'Wiesengrund', typ: '', plz: '10115' }, { ...access, partnerTyp: 'hundesalon' })).toEqual({})
  })

  test('rejects an unknown typ', () => {
    expect(validatePartnerSetup({ name: 'Wiesengrund', typ: 'zuechter', plz: '10115' }, access)).toHaveProperty('typ')
  })

  test('requires exactly five digits for the PLZ', () => {
    expect(validatePartnerSetup({ name: 'Wiesengrund', typ: 'hundeschule', plz: '' }, access)).toHaveProperty('plz')
    expect(validatePartnerSetup({ name: 'Wiesengrund', typ: 'hundeschule', plz: '1011' }, access)).toHaveProperty('plz')
    expect(validatePartnerSetup({ name: 'Wiesengrund', typ: 'hundeschule', plz: '1011a' }, access)).toHaveProperty('plz')
  })

  test('a bound access needs none of these fields', () => {
    expect(validatePartnerSetup({ name: '', typ: '', plz: '' }, { partnerTyp: 'hundeschule', partnerName: 'Wiesengrund' })).toEqual({})
  })
})

describe('partnerSetupPayload', () => {
  const values = { name: 'Hundeschule Wiesengrund', typ: 'hundeschule', plz: '10115' }

  test('sends name, typ and plz for an unbound access without preset', () => {
    expect(partnerSetupPayload(values, { partnerTyp: null, partnerName: null })).toEqual(values)
  })

  test('leaves typ out entirely when it is preset', () => {
    const payload = partnerSetupPayload(values, { partnerTyp: 'hundesalon', partnerName: null })
    expect(payload).toEqual({ name: 'Hundeschule Wiesengrund', plz: '10115' })
    expect(Object.hasOwn(payload, 'typ')).toBe(false)
  })

  test('sends nothing extra for a bound access', () => {
    expect(partnerSetupPayload(values, { partnerTyp: 'hundeschule', partnerName: 'Wiesengrund' })).toEqual({})
  })
})
