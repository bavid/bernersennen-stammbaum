import { describe, expect, test } from 'vitest'
import { getBackground } from './backgrounds.js'
import { PAGE } from './layout.js'
import { computeLayout } from './layouts.js'
import { drawBackground, drawPolaroid, drawStickers, drawTimelineMark } from './renderDesign.js'

// Zeichen-Kontext, der nur mitschreibt (jsdom hat kein Canvas)
function recorder() {
  const calls = []
  const state = {}
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key === 'calls') return calls
      if (key in target) return target[key]
      return (...args) => {
        calls.push([key, ...args])
        if (key === 'measureText') return { width: String(args[0]).length * 10 }
        return undefined
      }
    },
    set(target, key, value) {
      target[key] = value
      calls.push([`set:${String(key)}`, value])
      return true
    }
  })
  return ctx
}

const named = (ctx, name) => ctx.calls.filter(([key]) => key === name)

describe('drawBackground', () => {
  test('Farbe füllt die ganze Seite, ohne Kachel', () => {
    const ctx = recorder()
    drawBackground(ctx, getBackground('nacht'), null)
    expect(named(ctx, 'fillRect')).toEqual([['fillRect', 0, 0, PAGE.width, PAGE.height]])
    expect(named(ctx, 'drawImage')).toHaveLength(0)
  })

  test('Muster: Kacheln lückenlos ab (0, 0) über die ganze Seite', () => {
    const ctx = recorder()
    const bg = getBackground('pfoten')
    const tile = { tag: 'tile' }
    drawBackground(ctx, bg, tile)
    const draws = named(ctx, 'drawImage')
    const size = bg.tile.size
    expect(draws).toHaveLength(Math.ceil(PAGE.width / size) * Math.ceil(PAGE.height / size))
    expect(draws[0]).toEqual(['drawImage', tile, 0, 0, size, size])
    const last = draws.at(-1)
    expect(last[2] + size).toBeGreaterThanOrEqual(PAGE.width)
    expect(last[3] + size).toBeGreaterThanOrEqual(PAGE.height)
  })
})

describe('drawStickers', () => {
  test('dreht um die Mitte und zeichnet in der richtigen Größe', () => {
    const ctx = recorder()
    const img = { tag: 'sticker' }
    drawStickers(ctx, [{ id: 's', sticker: 'pfoten', x: 0.25, y: 0.5, size: 0.1, rotation: 90 }], [img])
    const size = 0.1 * PAGE.width
    const cx = 0.25 * PAGE.width
    const cy = 0.5 * PAGE.height
    expect(named(ctx, 'rotate')[0][1]).toBeCloseTo(Math.PI / 2)
    expect(named(ctx, 'translate')[0]).toEqual(['translate', cx, cy])
    expect(named(ctx, 'drawImage')[0]).toEqual(['drawImage', img, cx - size / 2, cy - size / 2, size, size])
    expect(named(ctx, 'save')).toHaveLength(1)
    expect(named(ctx, 'restore')).toHaveLength(1)
  })
})

describe('drawPolaroid und Zeitstrahl', () => {
  test('Polaroid: Schatten im Export-Maßstab, Foto beschnitten, Unterschrift in der Karte', () => {
    const ctx = recorder()
    const [frame] = computeLayout('polaroid', 1).frames
    let drewImage = false
    drawPolaroid(ctx, { frame, photo: { caption: 'Am See' }, scale: 2, drawImageInFrame: () => (drewImage = true) })
    expect(drewImage).toBe(true)
    expect(ctx.calls.find(([key]) => key === 'set:shadowBlur')[1]).toBeCloseTo(PAGE.width * 0.016 * 2)
    const [, text, x, y] = named(ctx, 'fillText')[0]
    expect(text).toBe('Am See')
    expect(x).toBeCloseTo(frame.polaroid.x + frame.polaroid.width / 2)
    expect(y).toBeGreaterThan(frame.y + frame.height)
    expect(y).toBeLessThan(frame.polaroid.y + frame.polaroid.height)
  })

  test('Zeitstrahl: Datum im deutschen Format, zur Linie hin ausgerichtet', () => {
    const ctx = recorder()
    const { frames, line } = computeLayout('timeline', 2)
    drawTimelineMark(ctx, frames[0], { date: '2026-06-01' }, line.x, getBackground('creme'))
    const [, text, x] = named(ctx, 'fillText')[0]
    expect(text).toBe('01.06.2026')
    expect(x).toBeCloseTo(frames[0].x + frames[0].width)
    expect(ctx.calls.find(([key]) => key === 'set:textAlign')[1]).toBe('right')
    expect(named(ctx, 'arc')[0].slice(1, 3)).toEqual([line.x, frames[0].timeline.dotY])
  })

  test('Zeitstrahl ohne Datum: nur Punkt, kein Text', () => {
    const ctx = recorder()
    const { frames, line } = computeLayout('timeline', 1)
    drawTimelineMark(ctx, frames[0], { date: '' }, line.x, getBackground('creme'))
    expect(named(ctx, 'fillText')).toHaveLength(0)
    expect(named(ctx, 'arc')).toHaveLength(1)
  })
})
