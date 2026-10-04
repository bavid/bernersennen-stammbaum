// @vitest-environment jsdom
import { afterEach, describe, expect, test } from 'vitest'
import { clearDrafts, draftHasContent, joinNames, readDraft, removeDraft, titleSuggestion, visibilityOptions, writeDraft } from './entryForm.js'

afterEach(() => window.sessionStorage.clear())

describe('Neue Erinnerung: Überschrift aus den ersten Worten', () => {
  test('der erste Satz, ohne Schlusspunkt', () => {
    expect(titleSuggestion('Erster Tag am See. Nele ist sofort reingesprungen.', '2026-10-04', 'Erinnerung')).toBe('Erster Tag am See')
    expect(titleSuggestion('  Ganz\nkurz!  ', '2026-10-04', 'Erinnerung')).toBe('Ganz kurz!')
  })

  test('zu lang: an einer Wortgrenze gekürzt, mit …', () => {
    const text = 'Heute waren wir zum allerersten Mal gemeinsam am großen Badesee hinter dem Deich und alle waren nass'
    const title = titleSuggestion(text, '2026-10-04', 'Erinnerung')
    expect(title.endsWith(' …')).toBe(true)
    expect(title.length).toBeLessThanOrEqual(62)
    expect(text.startsWith(title.slice(0, -2))).toBe(true)
  })

  test('ohne Text: das Wort und das Datum', () => {
    expect(titleSuggestion('', '2026-10-04', 'Erinnerung')).toBe('Erinnerung vom 4. Oktober 2026')
    expect(titleSuggestion('   ', '', 'Erinnerung')).toBe('Erinnerung')
  })
})

describe('Neue Erinnerung: Sichtbarkeit', () => {
  test('joinNames', () => {
    expect(joinNames(['A'])).toBe('A')
    expect(joinNames(['A', 'B'])).toBe('A und B')
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B und C')
  })

  test('zwei Möglichkeiten: privat oder mit den Familien teilen, in die das Tier geteilt ist', () => {
    const [privat, geteilt] = visibilityOptions(['Familie Sonnenhang'])
    expect(privat).toEqual(expect.objectContaining({ privat: true, label: 'Nur wir (privat)' }))
    expect(geteilt).toEqual(expect.objectContaining({ privat: false, label: 'Mit Familie Sonnenhang teilen' }))
    expect(geteilt.hint).toBe('Sehen auch Familie Sonnenhang und eure Gäste.')
    expect(visibilityOptions([])[1].label).toBe('Mit Familie & Gästen teilen')
    expect(visibilityOptions(['A', 'B', 'C'])[1].label).toBe('Mit A und 2 weiteren teilen')
  })
})

describe('Neue Erinnerung: Entwurf (sessionStorage)', () => {
  test('Inhalt: Text, Überschrift oder Foto', () => {
    expect(draftHasContent({ text: ' ', titel: '', fotos: [] })).toBe(false)
    expect(draftHasContent({ text: 'Hallo' })).toBe(true)
    expect(draftHasContent({ fotos: ['/uploads/a.jpg'] })).toBe(true)
  })

  test('schreiben, lesen (nur bekannte, gültige Felder), entfernen', () => {
    writeDraft('7', { text: 'See', titel: 'T', datum: '2026-10-01', fotos: ['/uploads/a.jpg', 'javascript:x', 3], privat: true, erlebtMit: [21, 'x'], fremd: 1 })
    expect(readDraft('7')).toEqual({ text: 'See', titel: 'T', datum: '2026-10-01', fotos: ['/uploads/a.jpg'], privat: true, erlebtMit: [21] })
    removeDraft('7')
    expect(readDraft('7')).toBeNull()
  })

  test('kaputte Daten zählen als kein Entwurf; clearDrafts räumt alle weg', () => {
    window.sessionStorage.setItem('chronik.entwurf.8', '{kaputt')
    expect(readDraft('8')).toBeNull()
    writeDraft('9', { text: 'a' })
    window.sessionStorage.setItem('anderes', 'bleibt')
    clearDrafts()
    expect(readDraft('9')).toBeNull()
    expect(window.sessionStorage.getItem('anderes')).toBe('bleibt')
  })
})
