import { describe, expect, test } from 'vitest'
import { addSticker, applyToAllPages, removeSticker, sortPhotosByDate, updateSticker } from './pageDesign.js'
import { buildPages, newPhoto, photosOfDog } from './pages.js'
import { MAX_STICKERS } from './stickers.js'

const page = (extra = {}) => ({ id: 'p1', title: 'T', subtitle: '', footer: '', photos: [], layout: 'auto', background: 'creme', stickers: [], ...extra })

describe('neue Seiten', () => {
  test('starten mit Vorlage Automatisch, Hintergrund Creme und ohne Sticker', () => {
    const [first] = buildPages([{ dog: { id: 1, name: 'Benno', name_unbekannt: 0, foto_url: '/uploads/1.jpg' }, entries: [] }])
    expect(first).toMatchObject({ layout: 'auto', background: 'creme', stickers: [] })
  })

  test('Fotos aus der Chronik merken sich ihr Datum (für den Zeitstrahl)', () => {
    const photos = photosOfDog({ id: 1, foto_url: '/uploads/1.jpg' }, [{ titel: 'Am See', datum: '2026-06-01', foto_urls: ['/uploads/a.jpg'] }])
    expect(photos.map((p) => p.date)).toEqual(['', '2026-06-01'])
    expect(newPhoto('/uploads/a.jpg', 'x', '2026-06-01').date).toBe('2026-06-01')
    expect(newPhoto('/uploads/a.jpg').date).toBe('')
  })
})

describe('Vorlage und Hintergrund für alle Seiten', () => {
  test('übernimmt nur die genannten Felder und lässt Fotos und Sticker stehen', () => {
    const pages = [page({ id: 'a', photos: [newPhoto('/uploads/a.jpg')] }), page({ id: 'b', layout: 'grid-2' })]
    const next = applyToAllPages(pages, { background: 'pfoten' })
    expect(next.map((p) => p.background)).toEqual(['pfoten', 'pfoten'])
    expect(next.map((p) => p.layout)).toEqual(['auto', 'grid-2'])
    expect(next[0].photos).toBe(pages[0].photos)
    expect(pages[0].background).toBe('creme')
  })

  test('ignoriert unbekannte Vorlagen und Hintergründe', () => {
    const pages = [page()]
    expect(applyToAllPages(pages, { layout: 'herz', background: 'neon' })[0]).toMatchObject({ layout: 'auto', background: 'creme' })
  })
})

describe('Sticker auf einer Seite', () => {
  test('hinzufügen, ändern, entfernen - immer als neue Seite', () => {
    const start = page()
    const withOne = addSticker(start, 'pfoten')
    expect(start.stickers).toHaveLength(0)
    expect(withOne.stickers).toHaveLength(1)
    const [sticker] = withOne.stickers
    expect(sticker.sticker).toBe('pfoten')

    const moved = updateSticker(withOne, sticker.id, { ...sticker, x: 2, rotation: 190 })
    expect(moved.stickers[0]).toMatchObject({ x: 1, rotation: -170 })
    expect(withOne.stickers[0].x).toBe(sticker.x)

    expect(removeSticker(moved, sticker.id).stickers).toHaveLength(0)
  })

  test('unbekannte Sticker werden nicht hinzugefügt', () => {
    const start = page()
    expect(addSticker(start, 'gibt-es-nicht')).toBe(start)
  })

  test(`höchstens ${MAX_STICKERS} Sticker je Seite`, () => {
    let current = page()
    for (let i = 0; i < MAX_STICKERS + 5; i += 1) current = addSticker(current, 'stern')
    expect(current.stickers).toHaveLength(MAX_STICKERS)
  })

  test('Seiten aus älteren Entwürfen ohne stickers-Feld', () => {
    const legacy = { id: 'old', title: '', subtitle: '', footer: '', photos: [] }
    expect(addSticker(legacy, 'stern').stickers).toHaveLength(1)
    expect(removeSticker(legacy, 'x').stickers).toEqual([])
  })
})

describe('Zeitstrahl: nach Datum sortieren', () => {
  test('ältestes zuerst, Fotos ohne Datum ans Ende (in ihrer Reihenfolge)', () => {
    const photos = [
      { ...newPhoto('/uploads/c.jpg', '', '2026-03-01'), id: 'c' },
      { ...newPhoto('/uploads/x.jpg', '', ''), id: 'x' },
      { ...newPhoto('/uploads/a.jpg', '', '2024-01-01'), id: 'a' },
      { ...newPhoto('/uploads/y.jpg'), id: 'y' },
      { ...newPhoto('/uploads/b.jpg', '', '2025-07-01'), id: 'b' }
    ]
    const sorted = sortPhotosByDate(page({ photos }))
    expect(sorted.photos.map((p) => p.id)).toEqual(['a', 'b', 'c', 'x', 'y'])
    expect(photos[0].id).toBe('c')
  })
})
