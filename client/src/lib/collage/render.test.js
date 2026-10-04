// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { PAGE } from './layout.js'
import { getBackground } from './backgrounds.js'
import { renderPage } from './render.js'
import { getTheme } from '../../themes/index.js'

// Canvas und Bilder gibt es in jsdom nicht: Zeichen-Aufrufe mitschreiben, Bilder sofort "geladen" melden.
function recorder() {
  const calls = []
  const ctx = new Proxy(
    {},
    {
      get(target, key) {
        if (key === 'calls') return calls
        if (key in target) return target[key]
        return (...args) => {
          calls.push([key, ...args])
          return key === 'measureText' ? { width: String(args[0]).length * 10 } : undefined
        }
      },
      set(target, key, value) {
        target[key] = value
        calls.push([`set:${String(key)}`, value])
        return true
      }
    }
  )
  return ctx
}

class FakeImage {
  constructor() {
    this.naturalWidth = 800
    this.naturalHeight = 600
  }

  set src(url) {
    this.url = url
    queueMicrotask(() => this.onload?.())
  }
}

let ctx
const originalImage = globalThis.Image

beforeEach(() => {
  ctx = recorder()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx)
  Object.defineProperty(document, 'fonts', { configurable: true, value: { load: () => Promise.resolve() } })
  globalThis.Image = FakeImage
})

afterEach(() => {
  vi.restoreAllMocks()
  delete document.fonts
  globalThis.Image = originalImage
})

const photo = (id, extra = {}) => ({ id, url: `/uploads/${id}.jpg`, caption: '', focusX: 0.5, focusY: 0.5, zoom: 1, date: '', ...extra })
const page = (extra = {}) => ({
  id: 'p1',
  title: 'Benno',
  subtitle: 'Berner',
  footer: '',
  photos: [photo('a'), photo('b')],
  layout: 'auto',
  background: 'creme',
  stickers: [],
  ...extra
})

const images = () => ctx.calls.filter(([key]) => key === 'drawImage').map(([, img]) => img.url)
const fills = () => ctx.calls.filter(([key]) => key === 'set:fillStyle').map(([, value]) => value)

describe('renderPage', () => {
  test('Reihenfolge: Hintergrund-Kacheln, Fotos, zuletzt die Sticker (über allem)', async () => {
    const stickers = [
      { id: 's1', sticker: 'krone', x: 0.5, y: 0.1, size: 0.1, rotation: 0 },
      { id: 's2', sticker: 'stern', x: 0.2, y: 0.9, size: 0.1, rotation: 30 }
    ]
    await renderPage(page({ background: 'pfoten', stickers }), getTheme('standard'))
    const drawn = images()
    const tiles = drawn.filter((url) => url.startsWith('data:image/svg+xml'))
    expect(tiles.length).toBe(Math.ceil(PAGE.width / 200) * Math.ceil(PAGE.height / 200))
    expect(drawn.slice(0, tiles.length).every((url) => url.startsWith('data:'))).toBe(true)
    expect(drawn.slice(tiles.length, tiles.length + 2)).toEqual(['/uploads/a.jpg', '/uploads/b.jpg'])
    expect(drawn.slice(-2)).toEqual(['/stickers/krone.svg', '/stickers/stern.svg'])
  })

  test('Schrift- und Papierfarben kommen aus dem Hintergrund', async () => {
    await renderPage(page({ background: 'nacht' }), getTheme('standard'))
    const bg = getBackground('nacht')
    expect(fills()[0]).toBe(bg.paper)
    expect(fills()).toContain(bg.ink)
    expect(fills()).toContain(bg.muted)
    // Der Strich oben/unten in der Akzentfarbe des Hintergrunds
    expect(fills()).toContain(bg.accent)
  })

  test('Polaroid und Zeitstrahl werden gezeichnet, ohne Muster keine Kacheln', async () => {
    await renderPage(page({ layout: 'polaroid', photos: [photo('a', { caption: 'Am See' })] }), getTheme())
    expect(images().filter((url) => url.startsWith('data:'))).toHaveLength(0)
    expect(ctx.calls.some(([key, text]) => key === 'fillText' && text === 'Am See')).toBe(true)
    expect(ctx.calls.some(([key]) => key === 'rotate')).toBe(true)

    ctx.calls.length = 0
    await renderPage(page({ layout: 'timeline', photos: [photo('a', { date: '2026-06-01' })] }), getTheme('standard'))
    expect(ctx.calls.some(([key, text]) => key === 'fillText' && text === '01.06.2026')).toBe(true)
  })
})
