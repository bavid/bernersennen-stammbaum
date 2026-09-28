import { describe, expect, test } from 'vitest'
import { formatVoucherCode, isCompleteVoucherCode } from './voucherCode.js'

describe('formatVoucherCode', () => {
  test('setzt Großbuchstaben und gruppiert in 4er-Blöcken mit Bindestrichen', () => {
    expect(formatVoucherCode('abcd1234hjkm')).toBe('ABCD-1234-HJKM')
  })

  test('baut die Gruppen schon während des Tippens auf (unvollständige Eingabe)', () => {
    expect(formatVoucherCode('abcd12')).toBe('ABCD-12')
    expect(formatVoucherCode('ab')).toBe('AB')
    expect(formatVoucherCode('')).toBe('')
  })

  test('entfernt eingetippte Bindestriche und Leerzeichen, bevor neu gruppiert wird', () => {
    expect(formatVoucherCode('abcd-1234 hjkm')).toBe('ABCD-1234-HJKM')
  })

  test('verwirft andere Sonderzeichen', () => {
    expect(formatVoucherCode('ab.cd_12!34')).toBe('ABCD-1234')
  })

  test('bricht bei 12 Zeichen ab, auch wenn mehr eingetippt wird', () => {
    expect(formatVoucherCode('abcd1234hjkmXYZ')).toBe('ABCD-1234-HJKM')
  })

  test('kommt mit null/undefined als Eingabe klar', () => {
    expect(formatVoucherCode(undefined)).toBe('')
    expect(formatVoucherCode(null)).toBe('')
  })
})

describe('isCompleteVoucherCode', () => {
  test('ist erst bei 12 Zeichen (ohne Bindestriche) vollständig', () => {
    expect(isCompleteVoucherCode('ABCD-1234-HJKM')).toBe(true)
    expect(isCompleteVoucherCode('ABCD-1234-HJK')).toBe(false)
    expect(isCompleteVoucherCode('')).toBe(false)
  })
})
