// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import Bilderrahmen from './Bilderrahmen.jsx'
import { DEFAULT_OPTIONEN } from '../../lib/bilderrahmen.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close() {
    this.open = false
  }
}

const FOTOS = [
  { url: '/uploads/a.jpg', tierName: 'Nele', datum: '2025-03-01', inErinnerung: false },
  { url: '/uploads/b.jpg', tierName: 'Flocke', datum: '2024-07-12', inErinnerung: true },
  { url: '/uploads/c.jpg', tierName: 'Mia', datum: null, inErinnerung: false }
]
const OPTIONEN = { ...DEFAULT_OPTIONEN, mischen: false, heuteZuerst: false, nacht: false, intervall: 10 }

let container
let root

const frame = (props) => <Bilderrahmen fotos={FOTOS} optionen={OPTIONEN} onOptionenChange={() => {}} onExit={() => {}} {...props} />

function render(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(frame(props)))
}

function rerender(props = {}) {
  act(() => root.render(frame(props)))
}

// Das oberste Foto (das gerade geladen wird bzw. steht) und sein Bild.
const topLayer = () => [...container.querySelectorAll('.frame-layer')].at(-1)
const topImg = () => topLayer()?.querySelector('.frame-img')
const shownName = () => topImg()?.getAttribute('alt')
const button = (label) => container.querySelector(`button[aria-label="${label}"]`)

function loadTop() {
  act(() => topImg().dispatchEvent(new Event('load')))
}

function advance(ms) {
  act(() => vi.advanceTimersByTime(ms))
}

function key(name, target = document.body) {
  act(() => target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true })))
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
  vi.useRealTimers()
  vi.unstubAllGlobals()
  delete window.matchMedia
})

describe('Bilderrahmen – Diashow', () => {
  test('wechselt nach dem gewählten Abstand – gezählt ab dem Moment, in dem das Foto steht', () => {
    render()
    expect(shownName()).toBe('Foto von Nele, 1. März 2025')
    advance(15_000)
    expect(shownName()).toBe('Foto von Nele, 1. März 2025') // noch nicht geladen: die Zeit läuft nicht
    loadTop()
    expect(topLayer().classList.contains('is-ready')).toBe(true)
    advance(9_999)
    expect(shownName()).toBe('Foto von Nele, 1. März 2025')
    advance(1)
    expect(shownName()).toBe('Foto von Flocke, 12. Juli 2024')
    loadTop()
    advance(10_000)
    expect(shownName()).toBe('Foto von Mia')
  })

  test('ein kaputtes Foto zeigt sich nie – es geht gleich mit dem nächsten weiter', () => {
    render()
    act(() => topImg().dispatchEvent(new Event('error')))
    expect(shownName()).toBe('Foto von Flocke, 12. Juli 2024')
    expect(container.querySelectorAll('.frame-layer')).toHaveLength(1)
  })

  test('Pause hält an, Weiter läuft wieder', () => {
    render()
    loadTop()
    act(() => button('Pause').click())
    advance(60_000)
    expect(shownName()).toBe('Foto von Nele, 1. März 2025')
    expect(button('Weiter')).not.toBeNull()
    act(() => button('Weiter').click())
    advance(10_000)
    expect(shownName()).toBe('Foto von Flocke, 12. Juli 2024')
  })

  test('Tastatur: Pfeile blättern, Leertaste pausiert, Esc beendet', () => {
    const onExit = vi.fn()
    render({ onExit })
    key('ArrowRight')
    expect(shownName()).toBe('Foto von Flocke, 12. Juli 2024')
    key('ArrowLeft')
    key('ArrowLeft')
    expect(shownName()).toBe('Foto von Mia')
    key(' ')
    expect(button('Weiter')).not.toBeNull()
    key(' ')
    expect(button('Pause')).not.toBeNull()
    key('Escape')
    return Promise.resolve().then(() => expect(onExit).toHaveBeenCalledTimes(1))
  })

  test('Bildunterschrift als Text: Name · Datum und klein „In Erinnerung“', () => {
    render()
    key('ArrowRight')
    const caption = topLayer().querySelector('figcaption')
    expect(caption.textContent).toBe('In ErinnerungFlocke · 12. Juli 2024')
  })
})

describe('Bilderrahmen – Ausfälle und neue Listen', () => {
  test('hängt ein Foto 20 Sekunden, geht es mit dem nächsten weiter', () => {
    render()
    advance(19_999)
    expect(shownName()).toBe('Foto von Nele, 1. März 2025')
    advance(1)
    expect(shownName()).toBe('Foto von Flocke, 12. Juli 2024')
  })

  test('lädt gar nichts: ein ruhiger Hinweis, nach einer Minute eine frische Liste – dann neue Versuche', () => {
    const onReload = vi.fn()
    render({ onReload })
    for (let i = 0; i < 3; i += 1) act(() => topImg().dispatchEvent(new Event('error')))
    expect(container.querySelector('.frame-img')).toBeNull()
    expect(container.querySelector('.frame-status').textContent).toContain('lassen sich gerade nicht laden')
    onReload.mockClear()
    advance(60_000)
    expect(onReload).toHaveBeenCalledTimes(1)
    rerender({ onReload, fotos: FOTOS.map((foto) => ({ ...foto })) })
    expect(shownName()).toBe('Foto von Nele, 1. März 2025')
    expect(container.querySelector('.frame-status')).toBeNull()
  })

  test('neu signierte Adressen derselben Fotos: das stehende Foto bleibt stehen, die Zeit läuft weiter', () => {
    const signed = (exp) => FOTOS.map((foto) => ({ ...foto, url: `${foto.url}?g=1&exp=${exp}&sig=x` }))
    render({ fotos: signed(1) })
    loadTop()
    advance(5_000)
    rerender({ fotos: signed(2) })
    expect(container.querySelectorAll('.frame-layer')).toHaveLength(1)
    expect(topLayer().classList.contains('is-ready')).toBe(true)
    advance(5_000)
    expect(shownName()).toBe('Foto von Flocke, 12. Juli 2024')
  })
})

describe('Bilderrahmen – Bewegung, Steuerung, Bildschirm', () => {
  test('angehalten bleibt die Steuerung sichtbar – auch nach weiteren Bewegungen', () => {
    render()
    act(() => button('Pause').click())
    act(() => container.querySelector('.frame-root').dispatchEvent(new MouseEvent('pointermove', { bubbles: true })))
    advance(10_000)
    expect(container.querySelector('.frame-controls').classList.contains('is-visible')).toBe(true)
    act(() => button('Weiter').click())
    advance(4_000)
    expect(container.querySelector('.frame-controls').classList.contains('is-visible')).toBe(false)
  })

  test('nur ein Foto: Zurück und Vor sind aus', () => {
    render({ fotos: FOTOS.slice(0, 1) })
    expect(button('Zurück').disabled).toBe(true)
    expect(button('Vor').disabled).toBe(true)
    expect(container.querySelector('[role="group"][aria-label="Bilderrahmen steuern"]')).not.toBeNull()
  })

  test('sanfter Schwenk – bei „Bewegung reduzieren“ nur Überblenden', () => {
    render()
    expect(topImg().classList.contains('is-moving')).toBe(true)
    expect(topImg().style.getPropertyValue('--frame-duration')).toBe('11.2s')
    act(() => root.unmount())
    container.remove()

    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener() {}, removeEventListener() {} })
    render()
    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
    expect(topImg().classList.contains('is-moving')).toBe(false)
  })

  test('Steuerung erscheint auf Bewegung und verschwindet nach 4 Sekunden', () => {
    render()
    const controls = () => container.querySelector('.frame-controls')
    expect(controls().classList.contains('is-visible')).toBe(true)
    advance(4_000)
    expect(controls().classList.contains('is-visible')).toBe(false)
    expect(container.querySelector('.frame-root').classList.contains('is-idle')).toBe(true)
    act(() => container.querySelector('.frame-root').dispatchEvent(new MouseEvent('pointermove', { bubbles: true })))
    expect(controls().classList.contains('is-visible')).toBe(true)
    // Alle Knöpfe haben einen Namen
    for (const label of ['Zurück', 'Pause', 'Vor', 'Einstellungen', 'Beenden']) expect(button(label)).not.toBeNull()
  })

  test('Bildschirm bleibt an (Wake Lock) und wird nach dem Zurückkommen neu angefordert', async () => {
    const release = vi.fn().mockResolvedValue(undefined)
    const request = vi.fn().mockResolvedValue({ release, addEventListener() {} })
    vi.stubGlobal('navigator', { ...navigator, wakeLock: { request } })
    render()
    await act(async () => {})
    expect(request).toHaveBeenCalledWith('screen')
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    expect(request).toHaveBeenCalledTimes(2)
    act(() => root.unmount())
    root = null
    expect(release).toHaveBeenCalled()
  })

  test('ohne Wake Lock: kein Fehler, das Einstellungs-Blatt nennt den Ausweg', () => {
    const onOptionenChange = vi.fn()
    render({ onOptionenChange })
    act(() => button('Einstellungen').click())
    const dialog = container.querySelector('dialog')
    expect(dialog.open).toBe(true)
    expect(dialog.textContent).toContain('stellt am Gerät die automatische Sperre aus')
    const thirty = [...dialog.querySelectorAll('input[name="frame-intervall"]')].find((input) => input.value === '30')
    act(() => thirty.click())
    expect(onOptionenChange).toHaveBeenCalledWith({ ...OPTIONEN, intervall: 30 })
  })

  test('Uhr und nachts dunkler, wenn eingeschaltet', () => {
    vi.setSystemTime(new Date(2026, 9, 4, 23, 15))
    render({ optionen: { ...OPTIONEN, uhr: true, nacht: true } })
    expect(container.querySelector('.frame-clock-time').textContent).toBe('23:15')
    expect(container.querySelector('.frame-night')).not.toBeNull()
  })
})
