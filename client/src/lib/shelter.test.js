import { describe, expect, test } from 'vitest'
import { adoptionSectionTitle, kategorieLabel } from './shelter.js'

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
