import { describe, expect, test } from 'vitest'
import { PAGE, PHOTO_AREA, computeFrames } from './layout.js'
import { LAYOUTS, TIMELINE, computeLayout, isLayoutId, layoutOf, toLocalDelta } from './layouts.js'

const EPS = 0.01
const overlap = (a, b) => a.x < b.x + b.width - EPS && b.x < a.x + a.width - EPS && a.y < b.y + b.height - EPS && b.y < a.y + a.height - EPS

// Umriss eines Rahmens samt Unterschrift (bzw. Polaroid-Karte inkl. Drehung) - muss im Fotobereich liegen
function outline(frame) {
  if (frame.polaroid) {
    const { x, y, width, height } = frame.polaroid
    const rad = (Math.abs(frame.rotation) * Math.PI) / 180
    const w = width * Math.cos(rad) + height * Math.sin(rad)
    const h = width * Math.sin(rad) + height * Math.cos(rad)
    return { x: x + width / 2 - w / 2, y: y + height / 2 - h / 2, width: w, height: h }
  }
  const top = frame.timeline ? frame.timeline.dateY : frame.y
  return { x: frame.x, y: top, width: frame.width, height: frame.captionY + (frame.captionHeight || 0) - top }
}

const inside = (box, area = PHOTO_AREA) =>
  box.x >= area.x - EPS && box.y >= area.y - EPS && box.x + box.width <= area.x + area.width + EPS && box.y + box.height <= area.y + area.height + EPS

describe('Vorlagen-Liste', () => {
  test('sechs Vorlagen mit deutschen Namen, Automatisch zuerst', () => {
    expect(LAYOUTS.map((l) => l.label)).toEqual(['Automatisch', 'Raster 2×2', 'Raster 3×3', 'Groß + klein', 'Polaroid', 'Zeitstrahl'])
    expect(isLayoutId('polaroid')).toBe(true)
    expect(isLayoutId('herz')).toBe(false)
    expect(layoutOf(undefined).id).toBe('auto')
  })

  test('Automatisch rechnet genau wie bisher', () => {
    expect(computeLayout('auto', 5, { withCaptions: true }).frames).toEqual(computeFrames(5, { withCaptions: true }))
    expect(computeLayout('gibt-es-nicht', 3).frames).toEqual(computeFrames(3))
  })
})

describe.each(LAYOUTS.map((l) => l.id))('Vorlage %s', (layoutId) => {
  test.each([0, 1, 2, 3, 4, 5, 6, 7, 9, 12])('%i Fotos: ein Rahmen je Foto, alles im Fotobereich, nichts überlappt', (count) => {
    const { frames, slots } = computeLayout(layoutId, count, { withCaptions: true })
    expect(frames).toHaveLength(count)
    const boxes = [...frames.map(outline), ...slots.map(outline)]
    boxes.forEach((box) => expect(inside(box)).toBe(true))
    if (layoutId === 'polaroid') return // gedrehte Karten dürfen sich an den Ecken berühren
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) expect(overlap(boxes[i], boxes[j])).toBe(false)
    }
  })
})

describe('Raster', () => {
  test('2×2 zeigt bei 3 Fotos ein freies Feld, bei 6 Fotos eine Reihe mehr', () => {
    const three = computeLayout('grid-2', 3)
    expect(three.slots).toHaveLength(1)
    expect(new Set(three.frames.map((f) => Math.round(f.width))).size).toBe(1)
    const six = computeLayout('grid-2', 6)
    expect(six.slots).toHaveLength(0)
    expect(new Set(six.frames.map((f) => Math.round(f.y))).size).toBe(3)
  })

  test('3×3 hat neun gleich große Felder', () => {
    const { frames, slots } = computeLayout('grid-3', 4)
    expect(frames.length + slots.length).toBe(9)
    const sizes = new Set([...frames, ...slots].map((f) => `${Math.round(f.width)}x${Math.round(f.height)}`))
    expect(sizes.size).toBe(1)
  })
})

describe('Groß + klein', () => {
  test('ein großes Bild oben, mindestens drei kleine Plätze darunter', () => {
    const { frames, slots } = computeLayout('hero', 2)
    expect(frames).toHaveLength(2)
    expect(slots).toHaveLength(2)
    const [hero, small] = frames
    expect(hero.width).toBeCloseTo(PHOTO_AREA.width)
    expect(hero.height).toBeGreaterThan(small.height * 1.8)
    expect(small.y).toBeGreaterThan(hero.y + hero.height)
  })

  test('mehr Fotos verteilen sich gleichmäßig auf weitere Reihen', () => {
    const { frames, slots } = computeLayout('hero', 6)
    expect(slots).toHaveLength(0)
    const rows = new Set(frames.slice(1).map((f) => Math.round(f.y)))
    expect(rows.size).toBe(2)
  })
})

describe('Polaroid', () => {
  test('gedrehte Karten mit weißem Rand und Platz für die Unterschrift unten', () => {
    const { frames } = computeLayout('polaroid', 4)
    const rotations = frames.map((f) => f.rotation)
    expect(rotations.some((r) => r < 0)).toBe(true)
    expect(rotations.some((r) => r > 0)).toBe(true)
    rotations.forEach((r) => expect(Math.abs(r)).toBeLessThanOrEqual(5))
    frames.forEach((frame) => {
      const card = frame.polaroid
      expect(frame.x).toBeGreaterThan(card.x)
      expect(frame.y).toBeGreaterThan(card.y)
      expect(frame.width).toBeCloseTo(frame.height) // quadratisches Foto
      const bottom = card.y + card.height - (frame.y + frame.height)
      expect(bottom).toBeGreaterThan(frame.x - card.x) // unten breiter als seitlich
      expect(card.captionFont).toBeGreaterThan(0)
    })
  })

  test('Unterschriften stecken in der Karte, nicht darunter', () => {
    const withCaptions = computeLayout('polaroid', 4, { withCaptions: true }).frames
    const without = computeLayout('polaroid', 4).frames
    expect(withCaptions).toEqual(without)
  })
})

describe('Zeitstrahl', () => {
  test('Fotos wechseln die Seite der Mittellinie, Datum und Punkt sitzen über dem Foto', () => {
    const { frames, line } = computeLayout('timeline', 5, { withCaptions: true })
    expect(line.x).toBe(PAGE.width / 2)
    frames.forEach((frame, i) => {
      const { side, dotY, dateY } = frame.timeline
      expect(side).toBe(i % 2 === 0 ? 'left' : 'right')
      if (side === 'left') expect(frame.x + frame.width).toBeLessThanOrEqual(line.x - TIMELINE.halfGap + EPS)
      else expect(frame.x).toBeGreaterThanOrEqual(line.x + TIMELINE.halfGap - EPS)
      expect(dateY).toBeLessThan(frame.y)
      expect(dotY).toBeGreaterThan(dateY)
      expect(dotY).toBeLessThan(frame.y)
      expect(dotY).toBeGreaterThanOrEqual(line.y1)
      expect(dotY).toBeLessThanOrEqual(line.y2)
    })
    // von oben nach unten, wie die Zeit
    for (let i = 1; i < frames.length; i += 1) expect(frames[i].y).toBeGreaterThan(frames[i - 1].y)
  })

  test('wenige Fotos bleiben in gutem Format statt riesig', () => {
    const [only] = computeLayout('timeline', 1).frames
    expect(only.height).toBeLessThanOrEqual(TIMELINE.maxPhotoHeight)
    expect(only.width / only.height).toBeGreaterThan(1)
  })
})

describe('toLocalDelta', () => {
  test('rechnet Zeigerbewegungen in das gedrehte Foto um', () => {
    expect(toLocalDelta(10, 0, 0)).toEqual({ dx: 10, dy: 0 })
    const turned = toLocalDelta(10, 0, 90)
    expect(turned.dx).toBeCloseTo(0)
    expect(turned.dy).toBeCloseTo(-10)
  })
})
