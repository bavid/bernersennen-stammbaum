import { describe, expect, test } from 'vitest'
import { commentsLabel, entryLink, excerpt, feedDog, thumbnails } from './feed.js'

describe('feed (Phase W)', () => {
  test('excerpt: kurzer Text bleibt, langer endet an einer Wortgrenze mit …', () => {
    expect(excerpt('  Erster   Schnee! ')).toBe('Erster Schnee!')
    expect(excerpt(null)).toBe('')
    const long = 'Wir waren heute am See und Nele ist zum ersten Mal geschwommen, ganz allein und ohne Angst.'
    expect(excerpt(long, 40)).toBe('Wir waren heute am See und Nele ist zum …')
    expect(excerpt(long, 40).length).toBeLessThanOrEqual(42)
  })

  test('thumbnails: höchstens drei, der Rest als Zahl; Unbrauchbares fällt weg', () => {
    expect(thumbnails(['/a', '/b'])).toEqual({ shown: ['/a', '/b'], more: 0 })
    expect(thumbnails(['/a', '/b', '/c', '/d', '/e'])).toEqual({ shown: ['/a', '/b', '/c'], more: 2 })
    expect(thumbnails(undefined)).toEqual({ shown: [], more: 0 })
    expect(thumbnails(['', null, '/a'])).toEqual({ shown: ['/a'], more: 0 })
  })

  test('commentsLabel, entryLink, feedDog', () => {
    expect(commentsLabel(0)).toBeNull()
    expect(commentsLabel(1)).toBe('1 Kommentar')
    expect(commentsLabel(3)).toBe('3 Kommentare')
    expect(entryLink({ id: 7, dog_id: 3 })).toBe('/tier/3#entry-7')
    expect(feedDog({ dog_name: 'Nele', dog_foto_url: '/uploads/n.jpg' })).toMatchObject({ name: 'Nele', foto_url: '/uploads/n.jpg' })
  })
})
