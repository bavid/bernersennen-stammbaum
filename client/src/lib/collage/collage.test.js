import { describe, expect, test } from 'vitest'
import { PHOTO_AREA, clampZoom, computeFrames, coverPlacement, dragFocus } from './layout.js'
import { buildPages, movePhoto, photosOfDog, removePhoto, updatePhoto, usedUrls } from './pages.js'

const inside = (frame, area) =>
  frame.x >= area.x - 0.01 &&
  frame.y >= area.y - 0.01 &&
  frame.x + frame.width <= area.x + area.width + 0.01 &&
  frame.captionY <= area.y + area.height + 0.01

const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

describe('computeFrames', () => {
  test.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 12])('%i photos fit the area without overlapping', (count) => {
    const frames = computeFrames(count, { withCaptions: true })
    expect(frames).toHaveLength(count)
    frames.forEach((frame) => expect(inside(frame, PHOTO_AREA)).toBe(true))
    for (let i = 0; i < frames.length; i += 1) {
      for (let j = i + 1; j < frames.length; j += 1) expect(overlap(frames[i], frames[j])).toBe(false)
    }
  })

  test('odd counts start with a larger hero photo', () => {
    const [hero, second] = computeFrames(3)
    expect(hero.width).toBeGreaterThan(second.width)
    expect(hero.height).toBeGreaterThan(second.height)
  })

  test('captions reserve space below each photo', () => {
    const [plain] = computeFrames(1)
    const [captioned] = computeFrames(1, { withCaptions: true })
    expect(captioned.height).toBeLessThan(plain.height)
  })
})

describe('coverPlacement and dragFocus', () => {
  const frame = { x: 0, y: 0, width: 100, height: 100 }
  const wide = { width: 200, height: 100 }

  test('covers the frame and centers by default', () => {
    expect(coverPlacement(wide, frame)).toEqual({ x: -50, y: 0, width: 200, height: 100 })
  })

  test('focus moves the visible part to the edges', () => {
    expect(coverPlacement(wide, frame, { focusX: 0 }).x).toBe(0)
    expect(coverPlacement(wide, frame, { focusX: 1 }).x).toBe(-100)
  })

  test('zoom enlarges around the focus point', () => {
    const placed = coverPlacement(wide, frame, { zoom: 2 })
    expect(placed.width).toBe(400)
    expect(placed.y).toBe(-50)
  })

  test('dragging right reveals the left part; axes without overflow stay put', () => {
    const photo = { focusX: 0.5, focusY: 0.5, zoom: 1 }
    const moved = dragFocus(photo, wide, frame, 50, 30)
    expect(moved.focusX).toBe(0)
    expect(moved.focusY).toBe(0.5)
  })

  test('zoom is clamped', () => {
    expect(clampZoom(0.2)).toBe(1)
    expect(clampZoom(9)).toBe(3)
  })
})

const dog = (id, name, extra = {}) => ({ id, name, name_unbekannt: 0, rasse: 'Berner Sennenhund', geburtsdatum: '2026-05-14', foto_url: `/uploads/${id}.jpg`, ...extra })
const entry = (titel, datum, urls) => ({ titel, datum, foto_urls: urls })

describe('buildPages', () => {
  test('uses entry titles and dates as captions, portrait first, no duplicates', () => {
    const photos = photosOfDog(dog(1, 'Hermes'), [entry('Am See', '2026-06-01', ['/uploads/a.jpg', '/uploads/1.jpg'])])
    expect(photos).toEqual([
      { url: '/uploads/1.jpg', caption: '', date: '' },
      { url: '/uploads/a.jpg', caption: 'Am See · 01.06.2026', date: '2026-06-01' }
    ])
  })

  test('splits many photos into several pages per dog and adds an overview page', () => {
    const urls = Array.from({ length: 7 }, (_, i) => `/uploads/e${i}.jpg`)
    const pages = buildPages(
      [
        { dog: dog(1, 'Hermes'), entries: [entry('Ausflug', '2026-06-01', urls)] },
        { dog: dog(2, 'Mika'), entries: [] }
      ],
      { perPage: 4, overview: true, familyName: 'Familie Sonnenhang' }
    )
    expect(pages.map((p) => p.title)).toEqual(['Familie Sonnenhang', 'Hermes · 1/2', 'Hermes · 2/2', 'Mika'])
    expect(pages[0].photos.map((p) => p.caption)).toEqual(['Hermes', 'Mika'])
    expect(pages[1].photos).toHaveLength(4)
    expect(pages[2].photos).toHaveLength(4)
  })

  test('editor helpers are immutable', () => {
    const [page] = buildPages([{ dog: dog(1, 'Hermes'), entries: [entry('A', '2026-06-01', ['/uploads/a.jpg'])] }])
    const [first, second] = page.photos
    const moved = movePhoto(page, second.id, 0)
    expect(moved.photos.map((p) => p.id)).toEqual([second.id, first.id])
    expect(page.photos[0].id).toBe(first.id)
    expect(removePhoto(page, first.id).photos).toHaveLength(1)
    expect(updatePhoto(page, first.id, { caption: 'Neu' }).photos[0].caption).toBe('Neu')
    expect(usedUrls([page]).has('/uploads/a.jpg')).toBe(true)
  })
})
