import { describe, expect, test } from 'vitest'
import { byMemoryDate, commentsLabel, entryLink, excerpt, feedDog, thumbnails } from './feed.js'

describe('feed (Phase W)', () => {
  test('excerpt: kurzer Text bleibt, langer endet an einer Wortgrenze mit …', () => {
    expect(excerpt('  Erster   Schnee! ')).toBe('Erster Schnee!')
    expect(excerpt(null)).toBe('')
    const long = 'Wir waren heute am See und Nele ist zum ersten Mal geschwommen, ganz allein und ohne Angst.'
    expect(excerpt(long, 40)).toBe('Wir waren heute am See und Nele ist zum …')
    expect(excerpt(long, 40).length).toBeLessThanOrEqual(42)
  })

  test('thumbnails: auf Start ein Foto als Polaroid, der Rest als Zahl; Unbrauchbares fällt weg', () => {
    expect(thumbnails(['/a', '/b'])).toEqual({ shown: ['/a'], more: 1 })
    expect(thumbnails(['/a', '/b', '/c', '/d', '/e'], 3)).toEqual({ shown: ['/a', '/b', '/c'], more: 2 })
    expect(thumbnails(undefined)).toEqual({ shown: [], more: 0 })
    expect(thumbnails(['', null, '/a'])).toEqual({ shown: ['/a'], more: 0 })
  })

  test('commentsLabel, entryLink, feedDog', () => {
    expect(commentsLabel(0)).toBeNull()
    expect(commentsLabel(1)).toBe('1 Gruß')
    expect(commentsLabel(3)).toBe('3 Grüße')
    expect(commentsLabel(2, { greeting: 'Kommentar', greetings: 'Kommentare' })).toBe('2 Kommentare')
    expect(entryLink({ id: 7, dog_id: 3 })).toBe('/tier/3#entry-7')
    expect(feedDog({ dog_name: 'Nele', dog_foto_url: '/uploads/n.jpg' })).toMatchObject({ name: 'Nele', foto_url: '/uploads/n.jpg' })
  })

  // Review B+: die Kapitel richten sich nach dem Tag der Erinnerung - die Liste dafür auch (sonst springen sie hin und her).
  test('byMemoryDate: neueste Erinnerung zuerst, bei gleichem Tag die zuletzt festgehaltene; ohne Datum ans Ende', () => {
    const entries = [
      { id: 1, datum: '2026-07-14', created_at: '2026-10-01 10:00:00' },
      { id: 2, datum: '2026-09-20', created_at: '2026-09-21 08:00:00' },
      { id: 3, datum: '2021-06-12', created_at: '2026-10-03 09:00:00' },
      { id: 4, datum: '2026-09-20', created_at: '2026-09-28 08:00:00' },
      { id: 5, datum: null, created_at: '2026-10-04 08:00:00' }
    ]
    expect(byMemoryDate(entries).map((entry) => entry.id)).toEqual([4, 2, 1, 3, 5])
    expect(entries.map((entry) => entry.id)).toEqual([1, 2, 3, 4, 5])
    expect(byMemoryDate(null)).toEqual([])
  })
})
