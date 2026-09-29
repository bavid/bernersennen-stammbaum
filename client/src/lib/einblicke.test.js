import { describe, expect, test } from 'vitest'
import { einblickChanges, isEinblickFileType, isUploadUrl, sortEinblicke } from './einblicke.js'

describe('sortEinblicke', () => {
  test('neueste zuerst, bei gleichem Datum die jüngere id vorn - ohne die Eingabe zu verändern', () => {
    const list = [
      { id: 1, datum: '2026-08-01' },
      { id: 3, datum: '2026-09-10' },
      { id: 2, datum: '2026-09-10' }
    ]
    expect(sortEinblicke(list).map((item) => item.id)).toEqual([3, 2, 1])
    expect(list.map((item) => item.id)).toEqual([1, 3, 2])
  })
})

describe('isEinblickFileType', () => {
  test('nur JPG und PNG', () => {
    expect(isEinblickFileType({ type: 'image/jpeg' })).toBe(true)
    expect(isEinblickFileType({ type: 'image/png' })).toBe(true)
    expect(isEinblickFileType({ type: 'image/webp' })).toBe(false)
    expect(isEinblickFileType(null)).toBe(false)
  })
})

describe('isUploadUrl', () => {
  test('nur eigene /uploads-Adressen', () => {
    expect(isUploadUrl('/uploads/abc.jpg')).toBe(true)
    expect(isUploadUrl('https://example.org/a.jpg')).toBe(false)
    expect(isUploadUrl('javascript:alert(1)')).toBe(false)
    expect(isUploadUrl(null)).toBe(false)
  })
})

describe('einblickChanges', () => {
  const einblick = { id: 1, datum: '2026-09-01', text: 'Erste Stunde im Agility-Parcours' }

  test('ohne Änderung: leeres Objekt', () => {
    expect(einblickChanges({ datum: '2026-09-01', text: 'Erste Stunde im Agility-Parcours' }, einblick)).toEqual({})
  })

  test('nur das Geänderte; geleerter Text wird null', () => {
    expect(einblickChanges({ datum: '2026-09-02', text: 'Erste Stunde im Agility-Parcours' }, einblick)).toEqual({ datum: '2026-09-02' })
    expect(einblickChanges({ datum: '2026-09-01', text: '  ' }, einblick)).toEqual({ text: null })
  })

  test('ein Einblick ohne Text: neuer Text wird getrimmt übernommen', () => {
    expect(einblickChanges({ datum: '2026-09-01', text: ' Wasserpause ' }, { ...einblick, text: null })).toEqual({ text: 'Wasserpause' })
  })
})
