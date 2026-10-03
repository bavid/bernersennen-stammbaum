import { describe, expect, test } from 'vitest'
import {
  NO_STATUS_LABEL,
  PAUSED_HINT,
  STECKBRIEF_PUBLISHABLE_STATUS,
  VERMITTLUNG_STATUS_VALUES,
  vermittlungStatusLabel,
  vermittlungStatusShortLabel
} from './vermittlung.js'

describe('VERMITTLUNG_STATUS_VALUES', () => {
  test('mirrors the server enum including "pausiert", in display order', () => {
    expect(VERMITTLUNG_STATUS_VALUES).toEqual(['in_vermittlung', 'reserviert', 'pausiert', 'vermittelt'])
  })
})

describe('vermittlungStatusLabel', () => {
  test('shows "Verfügbar" for in_vermittlung', () => {
    expect(vermittlungStatusLabel('in_vermittlung')).toBe('Verfügbar')
  })

  test('labels the other statuses, "pausiert" with the on-hold note', () => {
    expect(vermittlungStatusLabel('reserviert')).toBe('Reserviert')
    expect(vermittlungStatusLabel('pausiert')).toBe('Pausiert')
    expect(vermittlungStatusLabel('vermittelt')).toBe('Vermittelt')
  })

  test('returns null for no/unknown status', () => {
    expect(vermittlungStatusLabel(null)).toBeNull()
    expect(vermittlungStatusLabel(undefined)).toBeNull()
    expect(vermittlungStatusLabel('anderes')).toBeNull()
  })
})

describe('vermittlungStatusShortLabel', () => {
  test('is "Pausiert" (without the note) for filter chips, the full label otherwise', () => {
    expect(vermittlungStatusShortLabel('pausiert')).toBe('Pausiert')
    expect(vermittlungStatusShortLabel('in_vermittlung')).toBe('Verfügbar')
    expect(vermittlungStatusShortLabel('reserviert')).toBe('Reserviert')
  })

  test('returns null for an unknown status', () => {
    expect(vermittlungStatusShortLabel('anderes')).toBeNull()
  })
})

describe('STECKBRIEF_PUBLISHABLE_STATUS', () => {
  test('keeps a steckbrief published while available, reserved or paused - not once placed', () => {
    expect(STECKBRIEF_PUBLISHABLE_STATUS).toEqual(['in_vermittlung', 'reserviert', 'pausiert'])
    expect(STECKBRIEF_PUBLISHABLE_STATUS).not.toContain('vermittelt')
  })
})

describe('fixed texts', () => {
  test('the "no status" option and the paused hint', () => {
    expect(NO_STATUS_LABEL).toBe('– kein Status –')
    expect(PAUSED_HINT).toBe('Gerade nicht vermittelbar – schaut bald wieder vorbei.')
  })
})
