import { describe, expect, test } from 'vitest'
import {
  STICKER_SIZE,
  clampSticker,
  moveSticker,
  newSticker,
  normalizeAngle,
  resizeByDrag,
  rotateByDrag,
  resizeHandleCorner,
  rotateHandleBelow,
  rotateSticker,
  scaleSticker,
  stickerKeyAction
} from './stickerTransform.js'

const base = { id: 's1', sticker: 'pfoten', x: 0.5, y: 0.5, size: 0.14, rotation: 0 }

describe('newSticker', () => {
  test('liegt mittig auf der Seite, weitere leicht versetzt', () => {
    const first = newSticker('pfoten', 0)
    const second = newSticker('pfoten', 1)
    expect(first).toMatchObject({ sticker: 'pfoten', size: STICKER_SIZE.default, rotation: 0 })
    expect(first.id).not.toBe(second.id)
    expect(second.x).toBeGreaterThan(first.x)
    expect(second.y).toBeGreaterThan(first.y)
    ;[first, second].forEach((s) => {
      expect(s.x).toBeGreaterThan(0.3)
      expect(s.x).toBeLessThan(0.7)
    })
  })
})

describe('Begrenzen', () => {
  test('Position bleibt auf der Seite (0–1), Größe zwischen Minimum und Maximum', () => {
    expect(clampSticker({ ...base, x: -1, y: 4, size: 9, rotation: 200 })).toMatchObject({
      x: 0,
      y: 1,
      size: STICKER_SIZE.max,
      rotation: -160
    })
    expect(clampSticker({ ...base, size: 0 }).size).toBe(STICKER_SIZE.min)
  })

  test('ungültige Zahlen fallen auf sichere Werte zurück', () => {
    expect(clampSticker({ ...base, x: 'abc', y: NaN, size: undefined, rotation: Infinity })).toMatchObject({
      x: 0.5,
      y: 0.5,
      size: STICKER_SIZE.default,
      rotation: 0
    })
  })

  test('Winkel liegen immer in (-180, 180]', () => {
    expect(normalizeAngle(190)).toBe(-170)
    expect(normalizeAngle(-190)).toBe(170)
    expect(normalizeAngle(180)).toBe(180)
    expect(normalizeAngle(-180)).toBe(180)
    expect(normalizeAngle(720 + 15)).toBe(15)
  })
})

describe('Verschieben, Größe, Drehen (unveränderlich)', () => {
  test('moveSticker verschiebt relativ und bleibt auf der Seite', () => {
    const moved = moveSticker(base, 0.1, -0.2)
    expect(moved.x).toBeCloseTo(0.6)
    expect(moved.y).toBeCloseTo(0.3)
    expect(base.x).toBe(0.5)
    expect(moveSticker(base, 2, 0).x).toBe(1)
  })

  test('scaleSticker vergrößert und verkleinert im erlaubten Rahmen', () => {
    expect(scaleSticker(base, 2).size).toBeCloseTo(0.28)
    expect(scaleSticker(base, 100).size).toBe(STICKER_SIZE.max)
    expect(scaleSticker(base, 0.01).size).toBe(STICKER_SIZE.min)
  })

  test('rotateSticker dreht und normalisiert', () => {
    expect(rotateSticker(base, 15).rotation).toBe(15)
    expect(rotateSticker({ ...base, rotation: 175 }, 15).rotation).toBe(-170)
  })
})

describe('Tastatur', () => {
  const key = (k, extra = {}) => stickerKeyAction(base, { key: k, shiftKey: false, ...extra })

  test('Pfeiltasten verschieben, mit Umschalt in größeren Schritten', () => {
    expect(key('ArrowRight').sticker.x).toBeCloseTo(0.51)
    expect(key('ArrowLeft').sticker.x).toBeCloseTo(0.49)
    expect(key('ArrowUp').sticker.y).toBeCloseTo(0.49)
    expect(key('ArrowDown', { shiftKey: true }).sticker.y).toBeCloseTo(0.55)
  })

  test('+ und - ändern die Größe', () => {
    expect(key('+').sticker.size).toBeGreaterThan(base.size)
    expect(key('=').sticker.size).toBeGreaterThan(base.size)
    expect(key('-').sticker.size).toBeLessThan(base.size)
  })

  test('R dreht im Uhrzeigersinn, Umschalt+R zurück', () => {
    expect(key('r').sticker.rotation).toBe(15)
    expect(key('R', { shiftKey: true }).sticker.rotation).toBe(-15)
  })

  test('Entf und Rücktaste löschen, Escape hebt die Auswahl auf', () => {
    expect(key('Delete')).toEqual({ type: 'remove' })
    expect(key('Backspace')).toEqual({ type: 'remove' })
    expect(key('Escape')).toEqual({ type: 'deselect' })
  })

  test('andere Tasten bleiben unberührt (Tab, Enter, Buchstaben)', () => {
    expect(key('Tab')).toBeNull()
    expect(key('Enter')).toBeNull()
    expect(key('x')).toBeNull()
    expect(stickerKeyAction(base, { key: 'ArrowRight', ctrlKey: true })).toBeNull()
  })
})

describe('Ziehen an den Griffen', () => {
  const center = { x: 100, y: 100 }

  test('Größe wächst mit dem Abstand zur Mitte', () => {
    expect(resizeByDrag(0.1, center, { x: 150, y: 100 }, { x: 200, y: 100 })).toBeCloseTo(0.2)
    expect(resizeByDrag(0.1, center, { x: 150, y: 100 }, { x: 100, y: 100 })).toBe(STICKER_SIZE.min)
    expect(resizeByDrag(0.1, center, { x: 100, y: 100 }, { x: 300, y: 100 })).toBe(0.1)
  })

  test('Drehen folgt dem Winkel um die Mitte', () => {
    expect(rotateByDrag(0, center, { x: 100, y: 50 }, { x: 150, y: 100 })).toBeCloseTo(90)
    expect(rotateByDrag(10, center, { x: 100, y: 50 }, { x: 50, y: 100 })).toBeCloseTo(-80)
  })
})

describe('Dreh-Griff: oben, außer er ragte aus der Seite', () => {
  // Seite 600 × 848 px, Griff 13 px Radius, Mitte 23 px über der Sticker-Kante
  const page = { width: 600, height: 848 }

  test('mitten auf der Seite bleibt der Griff oben', () => {
    expect(rotateHandleBelow({ ...base, y: 0.5 }, page)).toBe(false)
  })

  test('ganz oben würde er abgeschnitten - dann unter dem Sticker', () => {
    expect(rotateHandleBelow({ ...base, y: 0.05 }, page)).toBe(true)
  })

  test('die Drehung zählt: um 180° gedreht zeigt "oben" nach unten', () => {
    expect(rotateHandleBelow({ ...base, y: 0.05, rotation: 180 }, page)).toBe(false)
    expect(rotateHandleBelow({ ...base, y: 0.95, rotation: 180 }, page)).toBe(true)
    // seitlich gedreht: der Griff zeigt nach rechts aus der Seite
    expect(rotateHandleBelow({ ...base, x: 0.97, rotation: 90 }, page)).toBe(true)
  })

  test('ohne gemessene Seite (z. B. beim ersten Rendern) bleibt er oben', () => {
    expect(rotateHandleBelow({ ...base, y: 0.01 }, { width: 0, height: 0 })).toBe(false)
  })
})

describe('Größen-Griff: in die Ecke, die auf der Seite liegt', () => {
  const page = { width: 600, height: 848 }

  test('normal unten rechts, am rechten Rand unten links, in der Ecke unten rechts oben links', () => {
    expect(resizeHandleCorner(base, page)).toBe('br')
    expect(resizeHandleCorner({ ...base, x: 0.97 }, page)).toBe('bl')
    expect(resizeHandleCorner({ ...base, x: 0.97, y: 0.98 }, page)).toBe('tl')
    expect(resizeHandleCorner({ ...base, y: 0.98 }, page)).toBe('tr')
  })

  test('ohne gemessene Seite bleibt er unten rechts', () => {
    expect(resizeHandleCorner({ ...base, x: 1 }, { width: 0, height: 0 })).toBe('br')
  })
})
