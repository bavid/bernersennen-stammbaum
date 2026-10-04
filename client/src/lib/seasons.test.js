import { describe, expect, test } from 'vitest'
import { groupBySeason, seasonLabel, yearsAgoLabel } from './seasons.js'

describe('seasonLabel – Kapitel nach Jahreszeiten (meteorologisch)', () => {
  test('Frühling März–Mai, Sommer Juni–August, Herbst September–November', () => {
    expect(seasonLabel('2026-03-01')).toBe('Frühling 2026')
    expect(seasonLabel('2026-05-31')).toBe('Frühling 2026')
    expect(seasonLabel('2026-06-01')).toBe('Sommer 2026')
    expect(seasonLabel('2026-08-31')).toBe('Sommer 2026')
    expect(seasonLabel('2026-09-01')).toBe('Herbst 2026')
    expect(seasonLabel('2026-11-30')).toBe('Herbst 2026')
  })

  test('ein Winter über den Jahreswechsel heißt nach beiden Jahren', () => {
    expect(seasonLabel('2026-12-01')).toBe('Winter 2026/27')
    expect(seasonLabel('2027-01-15')).toBe('Winter 2026/27')
    expect(seasonLabel('2027-02-28')).toBe('Winter 2026/27')
    expect(seasonLabel('2000-01-01')).toBe('Winter 1999/00')
  })

  test('ohne gültiges Datum kein Kapitel', () => {
    expect(seasonLabel(null)).toBeNull()
    expect(seasonLabel('gestern')).toBeNull()
  })
})

describe('groupBySeason', () => {
  const item = (datum, id) => ({ id, datum })

  test('aufeinanderfolgende Einträge derselben Jahreszeit bilden ein Kapitel - die Reihenfolge bleibt', () => {
    const items = [item('2026-10-01', 1), item('2026-09-05', 2), item('2026-07-01', 3), item('2025-12-24', 4), item('2026-01-02', 5)]
    expect(groupBySeason(items).map((group) => [group.label, group.items.map((entry) => entry.id)])).toEqual([
      ['Herbst 2026', [1, 2]],
      ['Sommer 2026', [3]],
      ['Winter 2025/26', [4, 5]]
    ])
  })

  test('eigener Datumszugriff; Einträge ohne Datum hängen am Kapitel davor (oder bilden eins ohne Titel)', () => {
    const items = [{ id: 1, when: 'kaputt' }, { id: 2, when: '2026-04-01' }, { id: 3, when: null }]
    const groups = groupBySeason(items, (entry) => entry.when)
    expect(groups.map((group) => [group.label, group.items.map((entry) => entry.id)])).toEqual([
      [null, [1]],
      ['Frühling 2026', [2, 3]]
    ])
    expect(new Set(groups.map((group) => group.key)).size).toBe(groups.length)
  })

  test('derselbe Name zweimal (nicht nebeneinander) bekommt trotzdem eindeutige Schlüssel', () => {
    const groups = groupBySeason([item('2026-10-01', 1), item('2026-06-01', 2), item('2026-10-02', 3)])
    expect(groups.map((group) => group.label)).toEqual(['Herbst 2026', 'Sommer 2026', 'Herbst 2026'])
    expect(new Set(groups.map((group) => group.key)).size).toBe(3)
  })
})

describe('yearsAgoLabel', () => {
  test('„Heute vor einem Jahr“, „Heute vor 3 Jahren“ - nur am selben Tag früherer Jahre', () => {
    expect(yearsAgoLabel('2025-10-04', '2026-10-04')).toBe('Heute vor einem Jahr')
    expect(yearsAgoLabel('2023-10-04', '2026-10-04')).toBe('Heute vor 3 Jahren')
    expect(yearsAgoLabel('2026-10-04', '2026-10-04')).toBeNull()
    expect(yearsAgoLabel('2025-10-05', '2026-10-04')).toBeNull()
    expect(yearsAgoLabel(null, '2026-10-04')).toBeNull()
  })
})
