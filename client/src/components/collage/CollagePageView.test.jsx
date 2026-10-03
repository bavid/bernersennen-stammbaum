// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import CollagePageView from './CollagePageView.jsx'
import { ThemeProvider } from '../../themes/ThemeProvider.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom hat kein Canvas: fürs Titel-Layout reicht eine feste, kleine Textbreite
const fakeContext = { measureText: () => ({ width: 10 }) }

let container
let getContextSpy

beforeEach(() => {
  getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext)
})

afterEach(() => {
  if (container) {
    act(() => container.remove())
    container = null
  }
  getContextSpy.mockRestore()
  delete document.documentElement.dataset.theme
})

const photo = (id, extra = {}) => ({ id, url: `/uploads/${id}.jpg`, caption: '', focusX: 0.5, focusY: 0.5, zoom: 1, date: '', ...extra })
const sticker = { id: 's1', sticker: 'pfoten', x: 0.5, y: 0.5, size: 0.1, rotation: 0 }
const basePage = { id: 'p1', title: 'Benno', subtitle: '', footer: '', photos: [photo('a'), photo('b')], layout: 'auto', background: 'creme', stickers: [] }

async function render(page, props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  const handlers = { onSelect: vi.fn(), onPhotoChange: vi.fn(), onStickerChange: vi.fn(), onStickerRemove: vi.fn() }
  await act(async () =>
    createRoot(container).render(
      <ThemeProvider themeId="standard">
        <CollagePageView page={page} {...handlers} {...props} />
      </ThemeProvider>
    )
  )
  return handlers
}

// jsdom kennt kein PointerEvent - React hört trotzdem auf den Ereignisnamen; pointerId/isPrimary nachgerüstet
function pointer(el, type, { x, y, button = 0, pointerId = 1, isPrimary = true }) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button })
  Object.defineProperties(event, { pointerId: { value: pointerId }, isPrimary: { value: isPrimary } })
  return act(() => el.dispatchEvent(event))
}

// Seite 620 × 877 px bei (0, 0): 1 px = 2 Seiteneinheiten
const PAGE_RECT = { left: 0, top: 0, width: 620, height: 877, right: 620, bottom: 877 }

const keyDown = (el, key, extra = {}) =>
  act(() => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra })))

describe('Hintergrund', () => {
  test('Farben als CSS-Variablen, Muster als gekachelte data:-URL', async () => {
    await render({ ...basePage, background: 'pfoten' })
    const style = container.querySelector('.cpage').style
    expect(style.getPropertyValue('--cpage-paper')).toBe('#f6efe4')
    expect(style.backgroundImage).toContain('data:image/svg+xml')
  })

  test('dunkle Farbe ohne Muster setzt helle Schrift', async () => {
    await render({ ...basePage, background: 'nacht' })
    const style = container.querySelector('.cpage').style
    expect(style.getPropertyValue('--cpage-ink')).toBe('#f5ecdf')
    expect(style.backgroundImage).toBe('')
  })
})

describe('Vorlagen', () => {
  test('Polaroid zeigt gedrehte Karten mit Unterschrift', async () => {
    await render({ ...basePage, layout: 'polaroid', photos: [photo('a', { caption: 'Am See' }), photo('b')] })
    const cards = container.querySelectorAll('.cpolaroid')
    expect(cards).toHaveLength(2)
    expect(cards[0].style.transform).toMatch(/rotate\(-?\d/)
    expect(cards[0].querySelector('.cpolaroid-caption').textContent).toBe('Am See')
    expect(container.querySelectorAll('.cpage-caption')).toHaveLength(0)
  })

  test('Zeitstrahl: Linie, Punkte und Datum im deutschen Format', async () => {
    await render({ ...basePage, layout: 'timeline', photos: [photo('a', { date: '2026-06-01' }), photo('b')] })
    expect(container.querySelector('.ctl-line')).not.toBeNull()
    expect(container.querySelectorAll('.ctl-dot')).toHaveLength(2)
    expect([...container.querySelectorAll('.ctl-date')].map((d) => d.textContent)).toEqual(['01.06.2026'])
  })

  test('freie Plätze nur im Editor, nie im Vorschaubild', async () => {
    await render({ ...basePage, layout: 'grid-3' }, { interactive: true })
    expect(container.querySelectorAll('.cslot')).toHaveLength(7)
    act(() => container.remove())
    await render({ ...basePage, layout: 'grid-3' })
    expect(container.querySelectorAll('.cslot')).toHaveLength(0)
  })
})

describe('Sticker', () => {
  test('im Vorschaubild nur als Bild, ohne Bedienung', async () => {
    await render({ ...basePage, stickers: [sticker] })
    const img = container.querySelector('img.csticker')
    expect(img.getAttribute('src')).toBe('/stickers/pfoten.svg')
    expect(img.getAttribute('aria-hidden')).toBe('true')
    expect(img.style.left).toBe('50%')
    expect(img.style.width).toBe('10%')
    expect(container.querySelector('[role="button"].csticker')).toBeNull()
  })

  test('im Editor per Tastatur erreichbar, mit Beschreibung der Tasten', async () => {
    const handlers = await render({ ...basePage, stickers: [sticker] }, { interactive: true })
    const el = container.querySelector('[aria-label="Sticker: Pfotenabdrücke"]')
    expect(el.getAttribute('tabindex')).toBe('0')
    const help = document.getElementById(el.getAttribute('aria-describedby'))
    expect(help.textContent).toContain('Pfeiltasten')
    act(() => el.focus())
    expect(handlers.onSelect).toHaveBeenCalledWith({ kind: 'sticker', id: 's1' })
  })

  test('Pfeiltaste verschiebt, R dreht, Entf löscht', async () => {
    const handlers = await render({ ...basePage, stickers: [sticker] }, { interactive: true, selection: { kind: 'sticker', id: 's1' } })
    const el = container.querySelector('.csticker.is-selected')
    expect(el.querySelectorAll('.csticker-handle')).toHaveLength(2)

    await keyDown(el, 'ArrowRight')
    const [id, moved] = handlers.onStickerChange.mock.calls[0]
    expect(id).toBe('s1')
    expect(moved.x).toBeCloseTo(0.51)

    await keyDown(el, 'r')
    expect(handlers.onStickerChange.mock.calls[1][1].rotation).toBe(15)

    await keyDown(el, 'Delete')
    expect(handlers.onStickerRemove).toHaveBeenCalledWith('s1')
    expect(document.activeElement).toBe(container.querySelector('.cpage'))
  })

  test('ganz oben rutscht der Dreh-Griff unter den Sticker (sonst abgeschnitten)', async () => {
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 600, height: 848, right: 600, bottom: 848 })
    try {
      await render({ ...basePage, stickers: [{ ...sticker, y: 0.03 }] }, { interactive: true, selection: { kind: 'sticker', id: 's1' } })
      expect(container.querySelector('.csticker-rotate').classList.contains('is-below')).toBe(true)
      act(() => container.remove())
      await render({ ...basePage, stickers: [sticker] }, { interactive: true, selection: { kind: 'sticker', id: 's1' } })
      expect(container.querySelector('.csticker-rotate').classList.contains('is-below')).toBe(false)
    } finally {
      rect.mockRestore()
    }
  })

  test('Escape hebt die Auswahl auf (Fokus auf die Seite), Tab bleibt unberührt', async () => {
    const handlers = await render({ ...basePage, stickers: [sticker] }, { interactive: true, selection: { kind: 'sticker', id: 's1' } })
    const el = container.querySelector('.csticker.is-selected')
    await keyDown(el, 'Tab')
    expect(handlers.onSelect).not.toHaveBeenCalled()
    await keyDown(el, 'Escape')
    expect(handlers.onSelect).toHaveBeenCalledWith(null)
    expect(document.activeElement).toBe(container.querySelector('.cpage'))
    expect(container.querySelector('.cpage').getAttribute('aria-label')).toBe('Collage-Seite')
  })

  test('gleiche Sticker werden für Vorleser durchnummeriert', async () => {
    await render({ ...basePage, stickers: [sticker, { ...sticker, id: 's2' }] }, { interactive: true })
    expect([...container.querySelectorAll('.csticker')].map((el) => el.getAttribute('aria-label'))).toEqual([
      'Sticker: Pfotenabdrücke 1',
      'Sticker: Pfotenabdrücke 2'
    ])
  })
})

describe('Sticker mit Zeiger', () => {
  let rect
  beforeEach(() => {
    rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(PAGE_RECT)
  })
  afterEach(() => rect.mockRestore())

  test('Ziehen verschiebt relativ zur Seite und wählt den Sticker aus', async () => {
    const handlers = await render({ ...basePage, stickers: [sticker] }, { interactive: true })
    const el = container.querySelector('.csticker')
    await pointer(el, 'pointerdown', { x: 310, y: 438 })
    await pointer(el, 'pointermove', { x: 372, y: 438 })
    expect(handlers.onSelect).toHaveBeenCalledWith({ kind: 'sticker', id: 's1' })
    const [id, moved] = handlers.onStickerChange.mock.calls.at(-1)
    expect(id).toBe('s1')
    expect(moved.x).toBeCloseTo(0.6)
    expect(moved.y).toBeCloseTo(0.5)
    await pointer(el, 'pointerup', { x: 372, y: 438 })
    await pointer(el, 'pointermove', { x: 500, y: 438 })
    expect(handlers.onStickerChange).toHaveBeenCalledTimes(1)
  })

  test('Rechtsklick und zweiter Finger starten nichts', async () => {
    const handlers = await render({ ...basePage, stickers: [sticker] }, { interactive: true })
    const el = container.querySelector('.csticker')
    await pointer(el, 'pointerdown', { x: 310, y: 438, button: 2 })
    await pointer(el, 'pointermove', { x: 400, y: 438 })
    await pointer(el, 'pointerdown', { x: 310, y: 438, pointerId: 2, isPrimary: false })
    await pointer(el, 'pointermove', { x: 400, y: 438, pointerId: 2 })
    expect(handlers.onStickerChange).not.toHaveBeenCalled()
  })

  test('Größen-Griff ändert die Größe, ohne den Sticker zu verschieben', async () => {
    const handlers = await render({ ...basePage, stickers: [sticker] }, { interactive: true, selection: { kind: 'sticker', id: 's1' } })
    const handle = container.querySelector('.csticker-resize')
    // Mitte (310, 438.5); doppelter Abstand zur Mitte = doppelte Größe
    await pointer(handle, 'pointerdown', { x: 341, y: 438.5 })
    await pointer(handle, 'pointermove', { x: 372, y: 438.5 })
    const [, resized] = handlers.onStickerChange.mock.calls.at(-1)
    expect(resized.size).toBeCloseTo(0.2)
    expect(resized.x).toBe(0.5)
    expect(handlers.onSelect).toHaveBeenCalledTimes(1)
  })

  test('Dreh-Griff dreht um die Mitte', async () => {
    const handlers = await render({ ...basePage, stickers: [sticker] }, { interactive: true, selection: { kind: 'sticker', id: 's1' } })
    const handle = container.querySelector('.csticker-rotate')
    await pointer(handle, 'pointerdown', { x: 310, y: 380 })
    await pointer(handle, 'pointermove', { x: 370, y: 438.5 })
    expect(handlers.onStickerChange.mock.calls.at(-1)[1].rotation).toBeCloseTo(90, 0)
  })

  test('am rechten Rand wandert der Größen-Griff in die linke Ecke', async () => {
    await render({ ...basePage, stickers: [{ ...sticker, x: 0.98 }] }, { interactive: true, selection: { kind: 'sticker', id: 's1' } })
    expect(container.querySelector('.csticker-resize').classList.contains('is-bl')).toBe(true)
  })
})
