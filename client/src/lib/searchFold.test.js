import { describe, expect, test } from 'vitest'
import { findMatch, foldText, highlightParts, matchesQuery } from './searchFold.js'

describe('searchFold (wie server/lib/searchText.js)', () => {
  test('faltet Groß/klein, Umlaute in beiden Fassungen, ß und Akzente', () => {
    expect(foldText('Müller')).toBe('mueller')
    expect(foldText('Müller', 'basis')).toBe('muller')
    expect(foldText('STRAẞE')).toBe('strasse')
    expect(foldText('Café')).toBe('cafe')
    expect(foldText(null)).toBe('')
  })

  test('findet die Stelle im Original, auch über Umlaute hinweg', () => {
    expect(findMatch('Herr Müller kam', 'mueller')).toEqual({ start: 5, end: 11 })
    expect(findMatch('Herr Müller kam', 'muller')).toEqual({ start: 5, end: 11 })
    expect(findMatch('Herr Mueller kam', 'Müller')).toEqual({ start: 5, end: 12 })
    expect(findMatch('Mühle', 'mu')).toEqual({ start: 0, end: 2 })
    expect(findMatch('Benno', 'xy')).toBeNull()
    expect(matchesQuery('Fotocollage', 'COLL')).toBe(true)
    // Kompatibilitätszeichen (ℌ) und Schluss-Sigma falten wie auf dem Server
    expect(findMatch('Der ℌund', 'hund')).toEqual({ start: 4, end: 8 })
    expect(findMatch('ΟΔΟΣ', 'οδος')).toEqual({ start: 0, end: 4 })
  })

  test('zerlegt den Text für die Hervorhebung', () => {
    expect(highlightParts('Strandtag mit Nele', 'nele')).toEqual([
      { text: 'Strandtag mit ', match: false },
      { text: 'Nele', match: true }
    ])
    expect(highlightParts('Jürgen', 'jur')).toEqual([
      { text: 'Jür', match: true },
      { text: 'gen', match: false }
    ])
    expect(highlightParts('Ohne', 'xy')).toEqual([{ text: 'Ohne', match: false }])
    expect(highlightParts('', 'xy')).toEqual([])
  })
})
