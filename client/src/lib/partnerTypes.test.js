import { describe, expect, test } from 'vitest'
import { SETUP_TYPE_OPTIONS, TYPE_LABELS, partnerStatusLabel, setupTypeLabel } from './partnerTypes.js'

// Spiegel von server/lib/partners.js TYP_VALUES - Züchter gibt es bewusst nicht.
const SERVER_TYP_VALUES = ['tierheim', 'vermittlung', 'hundeschule', 'hundesalon', 'betreuung', 'futter', 'sonstige']

describe('TYPE_LABELS', () => {
  test('covers every server partner type, in server order', () => {
    expect(Object.keys(TYPE_LABELS)).toEqual(SERVER_TYP_VALUES)
  })
})

describe('SETUP_TYPE_OPTIONS', () => {
  test('offers every server partner type with the descriptive setup label', () => {
    expect(SETUP_TYPE_OPTIONS.map((option) => option.value)).toEqual(SERVER_TYP_VALUES)
    expect(SETUP_TYPE_OPTIONS.map((option) => option.label)).toEqual([
      'Tierheim',
      'Vermittlungsstelle',
      'Hundeschule',
      'Hundesalon',
      'Betreuung (Hundesitter, Tagesstätte, Pension)',
      'Futter & Zubehör',
      'Sonstiges'
    ])
  })

  test('has no breeder option', () => {
    expect(SETUP_TYPE_OPTIONS.some((option) => /z(ü|ue)chter/i.test(option.value + option.label))).toBe(false)
  })
})

describe('setupTypeLabel', () => {
  test('returns the setup label, falling back to the raw value', () => {
    expect(setupTypeLabel('vermittlung')).toBe('Vermittlungsstelle')
    expect(setupTypeLabel('unbekannt')).toBe('unbekannt')
  })
})

describe('partnerStatusLabel', () => {
  test('labels draft, active and paused partners', () => {
    expect(partnerStatusLabel({ status: 'entwurf', gesperrt: false })).toBe('Entwurf')
    expect(partnerStatusLabel({ status: 'aktiv', gesperrt: false })).toBe('Aktiv')
    expect(partnerStatusLabel({ status: 'pausiert', gesperrt: false })).toBe('Pausiert')
  })

  test('a blocked partner is "Gesperrt", whatever its status', () => {
    expect(partnerStatusLabel({ status: 'pausiert', gesperrt: true })).toBe('Gesperrt')
  })

  test('returns null without a partner or with an unknown status', () => {
    expect(partnerStatusLabel(null)).toBeNull()
    expect(partnerStatusLabel({ status: 'anderes', gesperrt: false })).toBeNull()
  })
})
