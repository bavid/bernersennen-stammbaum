import { describe, expect, test } from 'vitest'
import { nextTermin, sortNotes } from './notes.js'
import { formatTermin, relativeTime } from './dates.js'

const note = (id, extra = {}) => ({ id, created_at: '2026-09-01 10:00:00', termin_datum: null, termin_zeit: null, ...extra })

describe('sortNotes', () => {
  const today = '2026-09-26'
  const notes = [
    note(1, { created_at: '2026-09-20 10:00:00' }),
    note(2, { termin_datum: '2026-10-18', termin_zeit: '14:00' }),
    note(3, { termin_datum: '2026-09-01' }),
    note(4, { termin_datum: '2026-10-02' }),
    note(5, { created_at: '2026-09-25 08:00:00' })
  ]

  test('upcoming meetings first (soonest on top), then newest notes, past meetings last', () => {
    expect(sortNotes(notes, today).map((n) => n.id)).toEqual([4, 2, 5, 1, 3])
  })

  test('finds the next meeting', () => {
    expect(nextTermin(notes, today).id).toBe(4)
    expect(nextTermin([note(9)], today)).toBeNull()
  })
})

describe('dates for the pinboard', () => {
  test('formats a meeting with weekday and optional time', () => {
    expect(formatTermin('2026-10-18', '14:00')).toBe('So, 18. Oktober 2026 · 14:00 Uhr')
    expect(formatTermin('2026-10-17')).toBe('Sa, 17. Oktober 2026')
    expect(formatTermin('2026-10-18', '14:00', { short: true })).toBe('So, 18. Oktober · 14:00 Uhr')
  })

  test('describes when something was written', () => {
    const now = new Date('2026-09-26T12:00:00Z')
    expect(relativeTime('2026-09-26 11:59:30', now)).toBe('gerade eben')
    expect(relativeTime('2026-09-26 11:20:00', now)).toBe('vor 40 Minuten')
    expect(relativeTime('2026-09-19 12:00:00', now)).toBe('19. September 2026')
  })
})
