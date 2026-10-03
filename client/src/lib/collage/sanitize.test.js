import { describe, expect, test } from 'vitest'
import { sanitizeDraft } from './sanitize.js'
import { MAX_STICKERS } from './stickers.js'

const photo = (extra = {}) => ({ id: 'f1', url: '/uploads/a.jpg', caption: 'Am See', focusX: 0.5, focusY: 0.5, zoom: 1, date: '2026-06-01', ...extra })
const sticker = (extra = {}) => ({ id: 's1', sticker: 'pfoten', x: 0.5, y: 0.5, size: 0.14, rotation: 0, ...extra })
const draftWith = (pageExtra = {}) => ({
  selectedIds: [1, 2],
  perPage: 6,
  overview: false,
  library: [{ url: '/uploads/a.jpg', caption: 'Am See', date: '2026-06-01' }],
  pages: [{ id: 'p1', title: 'Benno', subtitle: '', footer: '', photos: [photo()], layout: 'polaroid', background: 'pfoten', stickers: [sticker()], ...pageExtra }]
})

describe('sanitizeDraft (Entwurf aus dem Browser-Speicher)', () => {
  test('ein gültiger Entwurf bleibt unverändert', () => {
    const draft = draftWith()
    expect(sanitizeDraft(draft)).toEqual(draft)
  })

  test('kein oder kaputter Entwurf ergibt null', () => {
    expect(sanitizeDraft(null)).toBeNull()
    expect(sanitizeDraft('x')).toBeNull()
    expect(sanitizeDraft({ pages: 'nope' })).toBeNull()
  })

  test('ältere Entwürfe ohne Vorlage, Hintergrund und Sticker bekommen die Standardwerte', () => {
    const legacy = { pages: [{ id: 'p1', title: 'Alt', subtitle: '', footer: '', photos: [{ id: 'f', url: '/uploads/a.jpg', caption: '', focusX: 0.5, focusY: 0.5, zoom: 1 }] }], library: [] }
    const [page] = sanitizeDraft(legacy).pages
    expect(page).toMatchObject({ layout: 'auto', background: 'creme', stickers: [] })
    expect(page.photos[0].date).toBe('')
  })

  test('unbekannte Vorlagen, Hintergründe und Sticker-Ids werden verworfen', () => {
    const [page] = sanitizeDraft(draftWith({ layout: 'herz', background: 'url(evil)', stickers: [sticker({ sticker: '../x' }), sticker({ id: 's2' })] })).pages
    expect(page.layout).toBe('auto')
    expect(page.background).toBe('creme')
    expect(page.stickers.map((s) => s.id)).toEqual(['s2'])
  })

  test('Zahlen werden begrenzt, höchstens 30 Sticker je Seite', () => {
    const many = Array.from({ length: MAX_STICKERS + 10 }, (_, i) => sticker({ id: `s${i}`, x: 9, size: -1, rotation: 'x' }))
    const [page] = sanitizeDraft(draftWith({ stickers: many, photos: [photo({ zoom: 99, focusX: -3 })] })).pages
    expect(page.stickers).toHaveLength(MAX_STICKERS)
    expect(page.stickers[0]).toMatchObject({ x: 1, size: 0.04, rotation: 0 })
    expect(page.photos[0]).toMatchObject({ zoom: 3, focusX: 0 })
  })

  test('Fotos nur mit eigenen Pfaden (keine fremden Server, kein javascript:)', () => {
    const photos = [photo({ id: 'ok' }), photo({ id: 'ext', url: 'https://evil.test/a.jpg' }), photo({ id: 'proto', url: '//evil.test/a.jpg' }), photo({ id: 'js', url: 'javascript:alert(1)' })]
    const draft = sanitizeDraft({ ...draftWith({ photos }), library: [{ url: 'https://evil.test/b.jpg' }, { url: '/uploads/b.jpg' }] })
    expect(draft.pages[0].photos.map((p) => p.id)).toEqual(['ok'])
    expect(draft.library.map((p) => p.url)).toEqual(['/uploads/b.jpg'])
  })

  test('Texte werden auf ihre Feldlänge gekürzt, Datum nur im ISO-Format', () => {
    const [page] = sanitizeDraft(draftWith({ title: 'x'.repeat(500), photos: [photo({ caption: 7, date: 'gestern' })] })).pages
    expect(page.title).toHaveLength(160)
    expect(page.photos[0]).toMatchObject({ caption: '', date: '' })
  })
})

describe('sanitizeDraft: Härtung (Review V6)', () => {
  test('Pfade, die der Browser zu fremden Hosts auflöst, fliegen raus', () => {
    const bad = ['/\\evil.test/x.jpg','/\t/evil.test/x.jpg', '/\n/evil.test/x.jpg', '/ /evil.test', '/uploads/a b.jpg', '/x:y']
    const photos = [photo({ id: 'ok', url: '/uploads/a-1_B.jpg' }), ...bad.map((url, i) => photo({ id: `bad${i}`, url }))]
    const draft = sanitizeDraft({ ...draftWith({ photos }), library: bad.map((url) => ({ url })) })
    expect(draft.pages[0].photos.map((p) => p.id)).toEqual(['ok'])
    expect(draft.library).toEqual([])
  })

  test('doppelte Ids bekommen neue (sonst doppelte React-Schlüssel)', () => {
    const draft = sanitizeDraft({
      pages: [
        { id: 'p', title: '', photos: [photo({ id: 'f' }), photo({ id: 'f' })], stickers: [sticker({ id: 's' }), sticker({ id: 's' })] },
        { id: 'p', title: '', photos: [], stickers: [] }
      ]
    })
    const ids = (list) => new Set(list.map((x) => x.id)).size
    expect(ids(draft.pages)).toBe(2)
    expect(ids(draft.pages[0].photos)).toBe(2)
    expect(ids(draft.pages[0].stickers)).toBe(2)
    expect(draft.pages[0].photos[0].id).toBe('f')
  })
})
