import { describe, expect, test } from 'vitest'
import { adoptionSectionTitle, kategorieLabel, vermittlungStatusLabel } from './shelter.js'

describe('vermittlungStatusLabel', () => {
  test('returns the German label for a known status', () => {
    expect(vermittlungStatusLabel('in_vermittlung')).toBe('In Vermittlung')
    expect(vermittlungStatusLabel('reserviert')).toBe('Reserviert')
    expect(vermittlungStatusLabel('vermittelt')).toBe('Vermittelt')
  })

  test('returns null for no/unknown status', () => {
    expect(vermittlungStatusLabel(null)).toBeNull()
    expect(vermittlungStatusLabel(undefined)).toBeNull()
    expect(vermittlungStatusLabel('anderes')).toBeNull()
  })
})

describe('kategorieLabel', () => {
  test('returns the German label for a known category', () => {
    expect(kategorieLabel('ankunft')).toBe('Ankunft')
    expect(kategorieLabel('tierarzt')).toBe('Tierarzt')
    expect(kategorieLabel('verhalten')).toBe('Verhalten')
    expect(kategorieLabel('training')).toBe('Training')
    expect(kategorieLabel('gassi')).toBe('Gassi')
    expect(kategorieLabel('sonstiges')).toBe('Sonstiges')
  })

  test('returns null for no/unknown category', () => {
    expect(kategorieLabel(null)).toBeNull()
    expect(kategorieLabel(undefined)).toBeNull()
    expect(kategorieLabel('unbekannt')).toBeNull()
  })
})

describe('adoptionSectionTitle', () => {
  test('returns "Fellnasen …" when every animal is a dog or a cat', () => {
    expect(adoptionSectionTitle([{ tierart: 'hund' }, { tierart: 'katze' }])).toBe('Fellnasen suchen ein Zuhause')
  })

  test('returns "Tiere …" as soon as one animal is neither a dog nor a cat', () => {
    expect(adoptionSectionTitle([{ tierart: 'hund' }, { tierart: 'anderes' }])).toBe('Tiere suchen ein Zuhause')
  })

  test('returns "Tiere …" for an empty list (no assumption about what is missing)', () => {
    expect(adoptionSectionTitle([])).toBe('Tiere suchen ein Zuhause')
  })
})
