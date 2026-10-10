import { describe, expect, test } from 'vitest'
import {
  DEFAULT_OPTIONS,
  FOTOBUCH_RE,
  MAX_MEMORIES,
  bookImages,
  buildBook,
  canMakeBook,
  coverPhoto,
  fotobuchRoute,
  hasPrivate,
  paginate,
  rangeBounds,
  selectMemories,
  trimText,
  yearSpan
} from './fotobuch.js'

const TODAY = '2026-10-10'
const entry = (id, datum, extra = {}) => ({ id, datum, titel: `Erinnerung ${id}`, text: 'Benno am See', foto_urls: [`/m/${id}.jpg`], privat: 0, ...extra })
const opts = (patch = {}) => ({ ...DEFAULT_OPTIONS, ...patch })

describe('fotobuch – Route', () => {
  test('Route und Muster passen zusammen', () => {
    expect(fotobuchRoute(305)).toBe('/tier/305/fotobuch')
    expect('/tier/305/fotobuch'.match(FOTOBUCH_RE)[1]).toBe('305')
    expect(FOTOBUCH_RE.test('/tier/305/vermisst')).toBe(false)
  })
})

describe('fotobuch – Zeitraum', () => {
  test('alles, dieses Jahr, letzte 12 Monate, eigener Zeitraum', () => {
    expect(rangeBounds(opts(), TODAY)).toEqual({ from: null, to: null })
    expect(rangeBounds(opts({ range: 'year' }), TODAY)).toEqual({ from: '2026-01-01', to: null })
    expect(rangeBounds(opts({ range: '12m' }), TODAY)).toEqual({ from: '2025-10-10', to: null })
    expect(rangeBounds(opts({ range: 'custom', from: '2024-01-01', to: 'quatsch' }), TODAY)).toEqual({ from: '2024-01-01', to: null })
  })

  test('filtert nach Zeitraum und sortiert nach Datum', () => {
    const entries = [entry(3, '2026-03-01'), entry(1, '2024-05-01'), entry(2, '2025-12-24')]
    expect(selectMemories(entries, opts(), TODAY).memories.map((e) => e.id)).toEqual([1, 2, 3])
    expect(selectMemories(entries, opts({ range: 'year' }), TODAY).memories.map((e) => e.id)).toEqual([3])
    expect(selectMemories(entries, opts({ range: '12m' }), TODAY).memories.map((e) => e.id)).toEqual([2, 3])
    const custom = opts({ range: 'custom', from: '2024-01-01', to: '2025-12-31' })
    expect(selectMemories(entries, custom, TODAY).memories.map((e) => e.id)).toEqual([1, 2])
  })
})

describe('fotobuch – Auswahl', () => {
  test('private nur mit Haken, leere Einträge nie', () => {
    const entries = [entry(1, '2024-01-01'), entry(2, '2024-02-01', { privat: 1 }), entry(3, '2024-03-01', { titel: '', text: '', foto_urls: [] })]
    expect(selectMemories(entries, opts(), TODAY).memories.map((e) => e.id)).toEqual([1])
    expect(selectMemories(entries, opts({ includePrivate: true }), TODAY).memories.map((e) => e.id)).toEqual([1, 2])
    expect(hasPrivate(entries)).toBe(true)
    expect(canMakeBook([entries[2]])).toBe(false)
    expect(canMakeBook(entries)).toBe(true)
  })

  test('höchstens MAX_MEMORIES, mit Hinweis', () => {
    const many = Array.from({ length: MAX_MEMORIES + 5 }, (_, i) => entry(i + 1, `2020-01-${String((i % 28) + 1).padStart(2, '0')}`))
    const result = selectMemories(many, opts(), TODAY)
    expect(result.memories).toHaveLength(MAX_MEMORIES)
    expect(result).toMatchObject({ total: MAX_MEMORIES + 5, capped: true })
  })
})

describe('fotobuch – Seiten', () => {
  const memories = [entry(1, '2024-01-01'), entry(2, '2024-02-01'), entry(3, '2024-03-01'), entry(4, '2025-01-01'), entry(5, '2025-02-01')]

  test('vier je Seite, Kapitel je Jahr beginnt neu', () => {
    const pages = paginate(memories, { perPage: 4, chapters: true })
    expect(pages.map((p) => [p.chapter, p.items.length])).toEqual([
      [2024, 3],
      [2025, 2]
    ])
  })

  test('ohne Kapitel fortlaufend, zwei je Seite', () => {
    expect(paginate(memories, { perPage: 4, chapters: false }).map((p) => p.items.length)).toEqual([4, 1])
    const two = paginate(memories, { perPage: 2, chapters: true })
    expect(two.map((p) => [p.chapter, p.items.length])).toEqual([
      [2024, 2],
      [null, 1],
      [2025, 2]
    ])
  })

  test('Text wird an einer Wortgrenze gekürzt', () => {
    const long = 'Wilma '.repeat(100)
    const short = trimText(long, 50)
    expect(short.length).toBeLessThanOrEqual(52)
    expect(short.endsWith(' …')).toBe(true)
    expect(trimText('kurz', 50)).toBe('kurz')
  })

  test('Titelblatt: Jahre, Porträt vor Chronik-Foto, Bilderliste ohne Doppelte', () => {
    expect(yearSpan(memories)).toBe('2024 – 2025')
    expect(yearSpan([memories[0]])).toBe('2024')
    expect(coverPhoto({ foto_url: '/p/w.jpg' }, memories)).toBe('/p/w.jpg')
    expect(coverPhoto({}, memories)).toBe('/m/1.jpg')
    const book = buildBook({ dog: { name: 'Wilma' }, entries: memories, today: TODAY })
    expect(book).toMatchObject({ name: 'Wilma', count: 5, capped: false, cover: { years: '2024 – 2025', photo: '/m/1.jpg' } })
    expect(bookImages(book)).toEqual(['/m/1.jpg', '/m/2.jpg', '/m/3.jpg', '/m/4.jpg', '/m/5.jpg'])
  })
})
