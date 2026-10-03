import { describe, expect, test } from 'vitest'
import {
  MAX_ZEITRAEUME,
  formatZeitraeume,
  toZeitraeumePayload,
  zeitraeumeClientError,
  zeitraeumeErrorRow,
  zeitraeumeFormRows,
  zeitraeumeText
} from './zeitraeume.js'

const TODAY = '2026-10-03'

describe('Termine einer Anzeige anzeigen', () => {
  test('einzelne Tage und Zeiträume, kurz und ohne Jahr im laufenden Jahr', () => {
    const list = [
      { von: '2026-11-01', bis: null },
      { von: '2026-12-01', bis: null },
      { von: '2026-12-05', bis: '2026-12-10' },
      { von: '2026-12-28', bis: '2027-01-03' }
    ]
    expect(formatZeitraeume(list, TODAY)).toBe('1.11., 1.12., 5.–10.12., 28.12.–3.1.2027')
  })

  test('über Monatsgrenzen und im nächsten Jahr mit Jahr', () => {
    expect(formatZeitraeume([{ von: '2026-10-30', bis: '2026-11-02' }], TODAY)).toBe('30.10.–2.11.')
    expect(formatZeitraeume([{ von: '2027-05-05', bis: '2027-05-10' }, { von: '2027-06-01', bis: null }], TODAY)).toBe('5.–10.5.2027, 1.6.2027')
    // Im selben Jahr steht das Jahr nur einmal.
    expect(formatZeitraeume([{ von: '2027-01-31', bis: '2027-02-04' }], TODAY)).toBe('31.1.–4.2.2027')
  })

  test('vergangene fallen weg, ein laufender Zeitraum bleibt', () => {
    const list = [
      { von: '2026-09-01', bis: null },
      { von: '2026-10-01', bis: '2026-10-05' },
      { von: '2026-10-20', bis: null }
    ]
    expect(formatZeitraeume(list, TODAY)).toBe('1.–5.10., 20.10.')
    expect(formatZeitraeume(list, TODAY, { includePast: true })).toBe('1.9., 1.–5.10., 20.10.')
  })

  test('zeitraeumeText: "Termin" oder "Termine", leer ohne kommende', () => {
    expect(zeitraeumeText([{ von: '2026-10-20', bis: null }], TODAY)).toBe('Termin: 20.10.')
    expect(zeitraeumeText([{ von: '2026-10-20', bis: null }, { von: '2026-11-20', bis: null }], TODAY)).toBe('Termine: 20.10., 20.11.')
    expect(zeitraeumeText([{ von: '2026-01-01', bis: null }], TODAY)).toBe('')
    expect(zeitraeumeText(undefined, TODAY)).toBe('')
    expect(zeitraeumeText([{ von: 'kaputt' }], TODAY)).toBe('')
  })
})

describe('Termine einer Anzeige im Formular', () => {
  test('zeitraeumeFormRows: aus dem Beitrag, sonst leer', () => {
    expect(zeitraeumeFormRows(null)).toEqual([])
    expect(zeitraeumeFormRows({ zeitraeume: [{ von: '2026-10-20', bis: null }, { von: '2026-11-01', bis: '2026-11-03' }] })).toEqual([
      { von: '2026-10-20', bis: '' },
      { von: '2026-11-01', bis: '2026-11-03' }
    ])
  })

  test('toZeitraeumePayload: leere Zeilen fallen weg, bis leer = ein Tag', () => {
    expect(toZeitraeumePayload([{ von: '', bis: '' }, { von: '2026-10-20', bis: '' }, { von: '2026-11-01', bis: '2026-11-03' }])).toEqual([
      { von: '2026-10-20', bis: null },
      { von: '2026-11-01', bis: '2026-11-03' }
    ])
  })

  test('zeitraeumeErrorRow: die gemeinte Zeile, leere Zeilen zählen nicht', () => {
    const rows = [{ von: '2026-10-20', bis: '' }, { von: '', bis: '' }, { von: '2026-10-22', bis: '2026-10-21' }]
    expect(zeitraeumeErrorRow(rows, 'Termin 2: das Ende darf nicht vor dem Beginn liegen')).toBe(2)
    expect(zeitraeumeErrorRow(rows, 'Höchstens 12 Termine je Beitrag')).toBe(-1)
    expect(zeitraeumeErrorRow(rows, null)).toBe(-1)
  })

  test('zeitraeumeClientError: wie der Server', () => {
    expect(zeitraeumeClientError([{ von: '2026-10-20', bis: '' }])).toBe(null)
    expect(zeitraeumeClientError([{ von: '', bis: '2026-10-21' }])).toBe('Termin 1: bitte ein gültiges Datum angeben (JJJJ-MM-TT)')
    expect(zeitraeumeClientError([{ von: '2026-10-20', bis: '' }, { von: '2026-10-22', bis: '2026-10-21' }])).toBe(
      'Termin 2: das Ende darf nicht vor dem Beginn liegen'
    )
    const many = Array.from({ length: MAX_ZEITRAEUME + 1 }, () => ({ von: '2026-10-20', bis: '' }))
    expect(zeitraeumeClientError(many)).toBe('Höchstens 12 Termine je Beitrag')
  })
})
