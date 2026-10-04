// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({ setDarstellung: vi.fn() }))
vi.mock('../../api', () => ({ api }))
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock('../Toast.jsx', () => ({ useToast: () => toast }))

import DarstellungSection, { LIVE_SAVE_DELAY_MS } from './DarstellungSection.jsx'
import { DemoProvider } from '../../lib/demo.js'
import { STANDARD } from '../../lib/darstellung.js'
import { AKZENT_VORSCHLAEGE } from '../../lib/akzent.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const me = { id: 1, name: 'Zuhause am Deich', art: 'zuhause', role: 'leitung', isDemo: false, darstellung: { ...STANDARD } }

let container
let root
let latest

function Harness({ initial }) {
  const [family, setFamily] = useState(initial)
  latest = family
  return <DemoProvider value={family}>{family && <DarstellungSection family={family} onFamilyChange={setFamily} />}</DemoProvider>
}

async function render(initial = me) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<Harness initial={initial} />))
}

const radio = (name, value) => container.querySelector(`input[name="${name}"][value="${value}"]`)
const colorInput = () => container.querySelector('input[type="color"]')
const resetButton = () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Zurücksetzen')
const flush = () => act(async () => {})

function setColor(value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(colorInput(), value)
  colorInput().dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => {
  api.setDarstellung.mockImplementation(async (patch) => ({ ...STANDARD, ...patch }))
})

afterEach(() => {
  vi.useRealTimers()
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
  api.setDarstellung.mockReset()
  toast.mockReset()
})

describe('Mini-Designer (Einstellungen → Darstellung)', () => {
  test('alle Bereiche: Farbwelt, Akzentfarbe, Hintergrund, Schrift, Handschrift, Ecken, Schriftgröße - und die Vorschau', async () => {
    await render()
    expect([...container.querySelectorAll('legend')].map((legend) => legend.textContent)).toEqual([
      'Farbwelt',
      'Akzentfarbe',
      'Hintergrund',
      'Schrift',
      'Handschrift-Akzente',
      'Ecken',
      'Schriftgröße'
    ])
    expect([...container.querySelectorAll('input[name="modus"]')].map((input) => input.value)).toEqual(['hell', 'weiss', 'dunkel', 'auto'])
    expect(container.querySelector('.designer-preview').getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelectorAll('.designer-accent-swatch')).toHaveLength(6)
    expect(radio('akzent', '').checked).toBe(true)
    expect(resetButton().getAttribute('aria-disabled')).toBe('true')
  })

  test('Schrift, Handschrift, Ecken und Weiß: je eine Änderung, sofort angewandt und gespeichert', async () => {
    await render()
    await act(async () => radio('schriftart', 'lesbar').click())
    await act(async () => radio('handschrift', 'aus').click())
    await act(async () => radio('ecken', 'eckig').click())
    await act(async () => radio('modus', 'weiss').click())
    expect(api.setDarstellung.mock.calls.map(([patch]) => patch)).toEqual([
      { schriftart: 'lesbar' },
      { handschrift: 'aus' },
      { ecken: 'eckig' },
      { modus: 'weiss' }
    ])
    expect(latest.darstellung).toEqual({ ...STANDARD, schriftart: 'lesbar', handschrift: 'aus', ecken: 'eckig', modus: 'weiss' })
  })

  test('ein Vorschlag als Akzentfarbe - eine zu helle wird für gute Lesbarkeit angepasst, das steht dabei', async () => {
    await render()
    const darkEnough = AKZENT_VORSCHLAEGE.find((option) => option.label === 'Taubenblau')
    await act(async () => radio('akzent', darkEnough.farbe).click())
    expect(latest.darstellung.akzent).toBe(darkEnough.farbe)
    expect(api.setDarstellung).toHaveBeenLastCalledWith({ akzent: darkEnough.farbe })

    act(() => root.unmount())
    container.remove()
    await render({ ...me, darstellung: { ...STANDARD, modus: 'hell' } })
    const honig = AKZENT_VORSCHLAEGE.find((option) => option.label === 'Honig')
    await act(async () => radio('akzent', honig.farbe).click())
    expect(container.querySelector('.designer-adjusted').textContent).toMatch(/^Angepasst für gute Lesbarkeit/)
  })

  test('das Farbfeld: höchstens einmal je Bild gezeigt, gespeichert erst, wenn es ruht - einmal, mit der letzten Farbe', async () => {
    vi.useFakeTimers()
    await render()
    act(() => setColor('#336699'))
    act(() => setColor('#2f5f8f'))
    // Noch im selben Bild: gesammelt, nicht zweimal an <html>
    expect(latest.darstellung.akzent).toBe('')
    await act(async () => vi.advanceTimersByTime(20))
    expect(latest.darstellung.akzent).toBe('#2f5f8f')
    expect(container.querySelector('.designer-accent-custom').textContent).toContain('aktuell #2f5f8f')
    expect(api.setDarstellung).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTime(LIVE_SAVE_DELAY_MS))
    await flush()
    expect(api.setDarstellung.mock.calls).toEqual([[{ akzent: '#2f5f8f' }]])
  })

  test('verlässt man die Seite, solange das Farbfeld ruht, wird die Farbe trotzdem gespeichert', async () => {
    vi.useFakeTimers()
    await render()
    act(() => setColor('#7a3b6e'))
    act(() => root.unmount())
    root = null
    await flush()
    expect(api.setDarstellung).toHaveBeenCalledWith({ akzent: '#7a3b6e' })
  })

  test('Zurücksetzen: alles auf das Familienalbum, in einer Änderung - der Fokus bleibt auf dem Knopf', async () => {
    await render({ ...me, darstellung: { ...STANDARD, palette: 'meer', akzent: '#3f6e8c', ecken: 'eckig', schrift: 'gross' } })
    expect(resetButton().getAttribute('aria-disabled')).toBe('false')
    resetButton().focus()
    await act(async () => resetButton().click())
    expect(latest.darstellung).toEqual(STANDARD)
    expect(api.setDarstellung).toHaveBeenLastCalledWith(STANDARD)
    expect(resetButton().getAttribute('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(resetButton())
    // Noch einmal: nichts mehr zu tun
    await act(async () => resetButton().click())
    expect(api.setDarstellung).toHaveBeenCalledTimes(1)
  })

  // Review B+: Fehler, Reihenfolge, Ansage, Demo beim Verlassen.
  test('scheitert das Speichern: zurück auf den zuletzt bestätigten Wert, mit Hinweis; sonst „Gespeichert.“ für Screenreader', async () => {
    await render()
    await act(async () => radio('ecken', 'eckig').click())
    await flush()
    expect(container.querySelector('[aria-live="polite"]').textContent).toBe('Gespeichert.')

    api.setDarstellung.mockRejectedValueOnce(new Error('Server nicht erreichbar'))
    await act(async () => radio('schriftart', 'modern').click())
    await flush()
    expect(latest.darstellung.schriftart).toBe('klassisch')
    expect(latest.darstellung.ecken).toBe('eckig')
    expect(toast).toHaveBeenCalledWith('Server nicht erreichbar')
    expect(container.querySelector('[aria-live="polite"]').textContent).toBe('')
  })

  test('der Reihe nach: eine langsame erste Änderung kommt vor der zweiten beim Server an', async () => {
    const order = []
    let release
    api.setDarstellung.mockImplementationOnce(
      (patch) =>
        new Promise((resolve) => {
          release = () => {
            order.push(patch)
            resolve({})
          }
        })
    )
    api.setDarstellung.mockImplementation(async (patch) => {
      order.push(patch)
      return {}
    })
    await render()
    await act(async () => radio('palette', 'wald').click())
    await act(async () => radio('palette', 'meer').click())
    expect(order).toEqual([])
    await act(async () => release())
    await flush()
    expect(order).toEqual([{ palette: 'wald' }, { palette: 'meer' }])
  })

  test('Demo: eine noch ruhende Farbe beim Verlassen der Seite geht nicht an den Server', async () => {
    vi.useFakeTimers()
    await render({ ...me, isDemo: true })
    act(() => setColor('#7a3b6e'))
    act(() => root.unmount())
    root = null
    await flush()
    expect(api.setDarstellung).not.toHaveBeenCalled()
  })

  test('Demo: alles wirkt, nichts wird gespeichert', async () => {
    await render({ ...me, isDemo: true })
    await act(async () => radio('ecken', 'eckig').click())
    expect(latest.darstellung.ecken).toBe('eckig')
    expect(api.setDarstellung).not.toHaveBeenCalled()
  })
})
