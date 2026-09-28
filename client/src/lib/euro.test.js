import { describe, expect, test } from 'vitest'
import { centsToEuroInput, parseEuroToCents } from './euro.js'

describe('parseEuroToCents – Euro-Eingabe (deutsch oder mit Punkt) in ganze Cent', () => {
  test.each([
    ['1.250,50', 125050],
    ['1250,50', 125050],
    ['1250.5', 125050],
    ['1250', 125000],
    ['0,99', 99],
    [',5', 50],
    ['12,3', 1230],
    ['1.250', 125000],
    ['1.250.000,01', 125000001],
    ['1,250.50', 125050],
    ['0', 0],
    ['  42,00  ', 4200],
    ['42,00 €', 4200],
    ['€ 42', 4200],
    ['1 250,50', 125050],
    ['1 250,50', 125050]
  ])('%s -> %i Cent', (input, cents) => {
    expect(parseEuroToCents(input)).toBe(cents)
  })

  test('rundet auf ganze Cent (kaufmännisch, ohne Gleitkomma-Fehler)', () => {
    expect(parseEuroToCents('1,005')).toBe(101)
    expect(parseEuroToCents('1,004')).toBe(100)
    expect(parseEuroToCents('0,125')).toBe(13)
    expect(parseEuroToCents('2.675,995')).toBe(267600)
    expect(parseEuroToCents('19,999')).toBe(2000)
  })

  test.each([
    ['-1'],
    ['-0,50'],
    ['−5'],
    [''],
    ['   '],
    ['abc'],
    ['12a'],
    ['1,2,3'],
    ['1.2.3'],
    ['12.34.567'],
    ['1,250,50'],
    ['1.25.000'],
    ['1e5'],
    ['Infinity'],
    ['NaN'],
    ['.'],
    [','],
    ['€'],
    ['99999999999999999999'],
    [null],
    [undefined],
    [12.5]
  ])('%s -> null (ungültig)', (input) => {
    expect(parseEuroToCents(input)).toBeNull()
  })
})

describe('centsToEuroInput – Cent zurück ins Eingabefeld', () => {
  test.each([
    [125050, '1250,50'],
    [125000, '1250,00'],
    [99, '0,99'],
    [0, '0,00'],
    [5, '0,05']
  ])('%i -> %s', (cents, text) => {
    expect(centsToEuroInput(cents)).toBe(text)
  })

  test('Rundreise: parseEuroToCents(centsToEuroInput(x)) === x', () => {
    for (const cents of [0, 1, 99, 100, 125050, 1e9]) {
      expect(parseEuroToCents(centsToEuroInput(cents))).toBe(cents)
    }
  })

  test('ungültige Werte werden zu einem leeren Feld', () => {
    expect(centsToEuroInput(null)).toBe('')
    expect(centsToEuroInput(undefined)).toBe('')
    expect(centsToEuroInput(-5)).toBe('')
    expect(centsToEuroInput(12.5)).toBe('')
  })
})
