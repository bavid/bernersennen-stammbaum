import { describe, expect, test, vi } from 'vitest'
import { CARD_HEIGHT, CARD_WIDTH } from './grusskarte.js'
import { loadImage, renderCard, wrapLines } from './grusskarteCanvas.js'

// Zeichenfläche als Attrappe: jede Methode ein leerer Stub, measureText 10 px je Zeichen.
function fakeContext() {
  return new Proxy(
    { measureText: (text) => ({ width: text.length * 10 }), fillText: vi.fn(), drawImage: vi.fn() },
    { get: (target, key) => (key in target ? target[key] : () => {}), set: () => true }
  )
}

function fakeDoc({ blobs = [new Blob(['png'])] } = {}) {
  const ctx = fakeContext()
  const canvas = { getContext: () => ctx, toBlob: vi.fn((cb) => cb(blobs.shift() ?? null)) }
  return { ctx, canvas, doc: { fonts: { load: vi.fn(async () => []), ready: Promise.resolve() }, createElement: () => canvas } }
}

function imageImpl(ok) {
  return class {
    width = 800
    height = 600
    set src(_value) {
      queueMicrotask(() => (ok ? this.onload() : this.onerror()))
    }
  }
}

globalThis.Path2D ||= class {}

const model = { dogName: 'Benno', title: 'Am See', line: 'Ein schöner Tag.', date: '1. Mai 2024', photoUrl: '/uploads/a.jpg', qrUrl: 'https://chronik.example/', host: 'chronik.example' }

describe('grusskarteCanvas', () => {
  test('wrapLines bricht um und kürzt die letzte Zeile mit „…“', () => {
    const ctx = fakeContext()
    expect(wrapLines(ctx, 'eins zwei drei', 100, 2)).toEqual(['eins zwei', 'drei'])
    const lines = wrapLines(ctx, 'aaaa bbbb cccc dddd eeee', 100, 2)
    expect(lines).toHaveLength(2)
    expect(lines[1].endsWith('…')).toBe(true)
  })

  test('loadImage liefert null bei Ladefehler', async () => {
    expect(await loadImage('/uploads/x.jpg', imageImpl(false))).toBeNull()
    expect(await loadImage(null, imageImpl(true))).toBeNull()
  })

  test('renderCard zeichnet 1080 × 1350 mit Foto und wartet auf die Schriften', async () => {
    const { doc, canvas, ctx } = fakeDoc()
    const result = await renderCard(model, { doc, ImageImpl: imageImpl(true) })
    expect(canvas.width).toBe(CARD_WIDTH)
    expect(canvas.height).toBe(CARD_HEIGHT)
    expect(doc.fonts.load).toHaveBeenCalled()
    expect(ctx.drawImage).toHaveBeenCalled()
    expect(result.withPhoto).toBe(true)
    expect(ctx.fillText).toHaveBeenCalledWith('Benno', expect.any(Number), expect.any(Number), expect.any(Number))
  })

  test('Foto lädt nicht: Karte nur mit Text', async () => {
    const { doc, ctx } = fakeDoc()
    const result = await renderCard(model, { doc, ImageImpl: imageImpl(false) })
    expect(result.withPhoto).toBe(false)
    expect(ctx.drawImage).not.toHaveBeenCalled()
  })

  test('gesperrte Fläche (toBlob ohne Ergebnis): zweiter Versuch ohne Foto', async () => {
    const { doc, canvas } = fakeDoc({ blobs: [null, new Blob(['png'])] })
    const result = await renderCard(model, { doc, ImageImpl: imageImpl(true) })
    expect(result.withPhoto).toBe(false)
    expect(canvas.toBlob).toHaveBeenCalledTimes(2)
  })
})
