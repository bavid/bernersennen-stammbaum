// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../api', () => ({ api: { search: vi.fn() } }))

import { api } from '../../api'
import SearchButton from './SearchButton.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close() {
    this.open = false
  }
}

const home = { id: 1, name: 'Zuhause Lindenhof', art: 'zuhause' }
const family = { ...home, home, role: 'leitung', memberships: [] }
const eigen = { id: 1, name: 'Zuhause Lindenhof', art: 'eigen' }
const sonnenhang = { id: 7, name: 'Familie Sonnenhang', art: 'familie' }

const tier = (id, name, extra = {}) => ({ id, name, rasse: null, tierart: 'hund', fotoUrl: null, zuhause: null, inErinnerung: false, bereich: eigen, ...extra })
const RESULTS = {
  gruppen: {
    tiere: {
      treffer: [1, 2, 3, 4, 5, 6].map((id) => tier(id, `Nele ${id}`)).concat(tier(7, 'Nele 7', { zuhause: 'Zuhause Möwenweg', bereich: sonnenhang })),
      mehr: false
    },
    erinnerungen: {
      treffer: [
        { id: 12, titel: 'Strandtag', auszug: 'Mit Nele am Meer', datum: '2026-05-01', tier: { id: 3, name: 'Nele 3' }, zuhause: 'Zuhause Möwenweg', bereich: sonnenhang }
      ],
      mehr: false
    },
    pinnwand: { treffer: [], mehr: false },
    familien: { treffer: [], mehr: false },
    partner: { treffer: [{ id: 4, slug: 'pfoten', name: 'Hundeschule Nelenweg', typ: 'hundeschule', ort: 'Bremen', logoUrl: null }], mehr: false }
  }
}
const EMPTY = { gruppen: { tiere: { treffer: [], mehr: false }, erinnerungen: { treffer: [], mehr: false } } }

let container
let root
const onInvite = vi.fn()

function Where() {
  const location = useLocation()
  return <output data-testid="where">{`${location.pathname}${location.search}${location.hash}`}</output>
}

function render(who = family) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() =>
    root.render(
      <MemoryRouter initialEntries={['/start']}>
        <button type="button" id="vorher">
          vorher
        </button>
        <SearchButton family={who} onInvite={onInvite} />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    )
  )
}

const trigger = () => container.querySelector('button[aria-label="Suchen"]')
const dialog = () => container.querySelector('dialog')
const input = () => container.querySelector('input[role="combobox"]')
const options = () => [...container.querySelectorAll('[role="option"]')]
const headings = () => [...container.querySelectorAll('.search-group-title')].map((el) => el.textContent)
const where = () => container.querySelector('[data-testid="where"]').textContent
const status = () => container.querySelector('[role="status"]').textContent

function type(value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  act(() => {
    setter.call(input(), value)
    input().dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function key(target, name, init = {}) {
  act(() => target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init })))
}

async function settle(ms = 250) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
  await act(async () => {})
}

function open() {
  act(() => trigger().click())
}

beforeEach(() => {
  vi.useFakeTimers()
  api.search.mockReset()
  api.search.mockResolvedValue(RESULTS)
  onInvite.mockReset()
  window.localStorage.clear()
})

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
  vi.useRealTimers()
})

describe('Suche: Knopf, Tastenkürzel, Dialog', () => {
  test('Lupe „Suchen“ öffnet den Dialog mit fokussiertem Feld', () => {
    render()
    expect(trigger().getAttribute('aria-haspopup')).toBe('dialog')
    expect(dialog().open).toBe(false)
    open()
    expect(dialog().open).toBe(true)
    expect(document.activeElement).toBe(input())
    expect(input().getAttribute('placeholder')).toBe('Suchen nach Tieren, Erinnerungen, Familien …')
    expect(input().getAttribute('autofocus')).toBe('')
    expect(container.textContent).toContain('Sucht nach dem Namen eines Tiers')
  })

  test('Strg+K und ⌘+K öffnen - nicht, während man in einem Feld tippt', () => {
    render()
    const field = document.createElement('input')
    document.body.appendChild(field)
    key(field, 'k', { ctrlKey: true })
    expect(dialog().open).toBe(false)
    key(document.body, 'k', { ctrlKey: true, shiftKey: true })
    expect(dialog().open).toBe(false)
    key(document.body, 'k', { ctrlKey: true })
    expect(dialog().open).toBe(true)
    key(input(), 'Escape')
    expect(dialog().open).toBe(false)
    key(document.body, 'K', { metaKey: true })
    expect(dialog().open).toBe(true)
    field.remove()
  })

  test('Escape schließt und gibt den Fokus zurück', () => {
    render()
    container.querySelector('#vorher').focus()
    key(document.body, 'k', { ctrlKey: true })
    expect(document.activeElement).toBe(input())
    key(input(), 'Escape')
    expect(dialog().open).toBe(false)
    expect(document.activeElement).toBe(container.querySelector('#vorher'))
    // per Klick geöffnet (der Knopf hat dabei den Fokus): zurück an die Lupe
    trigger().focus()
    open()
    act(() => container.querySelector('button[aria-label="Schließen"]').click())
    expect(document.activeElement).toBe(trigger())
  })
})

describe('Suche: Treffer', () => {
  test('wartet 250 ms und zwei Zeichen ab, bevor sie fragt', async () => {
    render()
    open()
    type('N')
    await settle(1000)
    expect(api.search).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Noch ein Zeichen mehr')
    type('Ne')
    await settle(100)
    type('Nel')
    await settle(200)
    expect(api.search).not.toHaveBeenCalled()
    await settle(50)
    expect(api.search).toHaveBeenCalledTimes(1)
    expect(api.search).toHaveBeenCalledWith('Nel')
  })

  test('gruppiert mit Überschriften, höchstens fünf je Gruppe, „Alle 7 anzeigen“ klappt auf, Treffer hervorgehoben', async () => {
    render()
    open()
    type('nele')
    await settle()
    expect(headings()).toEqual(['Tiere', 'Erinnerungen', 'Partner'])
    expect(status()).toBe('9 Treffer')
    const expand = options().find((option) => option.textContent === 'Alle 7 anzeigen')
    expect(options()).toHaveLength(8)
    expect(container.querySelector('.search-mark').textContent).toBe('Nele')
    // Wo das Tier wohnt, nicht der Bereich: eigene Tiere ohne Chip, die Erinnerung aus dem Möwenweg mit leisem Familien-Zusatz
    const chips = [...container.querySelectorAll('.search-chip')]
    expect(chips.map((chip) => chip.textContent)).toEqual(['aus Zuhause Möwenweg, geteilt in Familie Sonnenhang'])
    expect(chips[0].getAttribute('title')).toBe('geteilt in Familie Sonnenhang')
    expect(container.textContent).not.toContain('Mein Zuhause')
    act(() => expand.click())
    expect(options()).toHaveLength(9)
    expect(options().some((option) => option.textContent === 'Alle 7 anzeigen')).toBe(false)
    const seventh = options().find((option) => option.textContent.includes('Nele 7'))
    expect(seventh.querySelector('.search-chip').textContent).toBe('aus Zuhause Möwenweg, geteilt in Familie Sonnenhang')
    expect(seventh.textContent).not.toContain('bei Zuhause')
    expect(document.activeElement).toBe(input())
  })

  test('↑/↓ mit aria-activedescendant, Enter öffnet den Treffer im richtigen Bereich und merkt sich die Suche', async () => {
    render()
    open()
    type('nele')
    await settle()
    expect(input().getAttribute('aria-expanded')).toBe('true')
    expect(input().getAttribute('aria-controls')).toBe(container.querySelector('[role="listbox"]').id)
    expect(input().hasAttribute('aria-activedescendant')).toBe(false)
    key(input(), 'ArrowDown')
    expect(input().getAttribute('aria-activedescendant')).toBe(options()[0].id)
    expect(options()[0].getAttribute('aria-selected')).toBe('true')
    key(input(), 'ArrowUp')
    expect(input().getAttribute('aria-activedescendant')).toBe(options().at(-1).id)
    key(input(), 'ArrowUp')
    key(input(), 'Enter')
    expect(where()).toBe('/tier/3?in=7#entry-12')
    expect(dialog().open).toBe(false)
    expect(JSON.parse(window.localStorage.getItem('chronik.suche.verlauf.1'))).toEqual(['nele'])
  })

  test('Enter ohne aktive Option öffnet den ersten Treffer; Partner führen zum Portal', async () => {
    render()
    open()
    type('nele')
    await settle()
    key(input(), 'Enter')
    expect(where()).toBe('/tier/1?in=1')
    open()
    type('nele')
    await settle()
    act(() => options().find((option) => option.textContent.includes('Hundeschule Nelenweg')).click())
    expect(where()).toBe('/p/pfoten')
  })

  test('keine Treffer: „Keine Treffer für …“', async () => {
    api.search.mockResolvedValue(EMPTY)
    render()
    open()
    type('xyzq')
    await settle()
    expect(status()).toBe('Keine Treffer für „xyzq“')
    expect(container.textContent).toContain('Keine Treffer für „xyzq“.')
    expect(options()).toHaveLength(0)
    expect(container.querySelector('[role="listbox"]').hidden).toBe(true)
  })

  test('Fehler des Servers: ruhige Meldung, „Noch einmal versuchen“ fragt erneut', async () => {
    api.search.mockRejectedValueOnce(Object.assign(new Error('kaputt'), { status: 500 }))
    render()
    open()
    type('nele')
    await settle()
    expect(status()).toBe('Die Suche hat gerade nicht geklappt – bitte gleich noch einmal versuchen.')
    const retry = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Noch einmal versuchen')
    act(() => retry.click())
    await settle()
    expect(api.search).toHaveBeenCalledTimes(2)
    expect(status()).toBe('9 Treffer')
    expect(document.activeElement).toBe(input())
  })

  test('der Server hat nicht alles durchsucht: ruhiger Hinweis', async () => {
    api.search.mockResolvedValue({ ...RESULTS, unvollstaendig: true })
    render()
    open()
    type('nele')
    await settle()
    expect(container.textContent).toContain('Nicht alles durchsucht – mit einem genaueren Wort findet ihr mehr.')
  })

  test('Admin-Ansicht: öffnet Treffer, merkt sich die Suche aber nicht', async () => {
    render({ ...family, adminView: true })
    open()
    type('nele')
    await settle()
    key(input(), 'Enter')
    expect(where()).toBe('/tier/1?in=1')
    expect(window.localStorage.getItem('chronik.suche.verlauf.1')).toBeNull()
  })

  test('zu viele Suchen (429): die Meldung des Servers', async () => {
    api.search.mockRejectedValue(Object.assign(new Error('Sehr viele Suchen in kurzer Zeit – bitte einen Moment warten.'), { status: 429 }))
    render()
    open()
    type('nele')
    await settle()
    expect(status()).toBe('Sehr viele Suchen in kurzer Zeit – bitte einen Moment warten.')
  })

  test('eine ältere Antwort, die zu spät kommt, überschreibt die neue nicht', async () => {
    let resolveOld
    api.search.mockImplementationOnce(() => new Promise((resolve) => (resolveOld = resolve)))
    api.search.mockResolvedValueOnce(EMPTY)
    render()
    open()
    type('ne')
    await settle()
    type('nexy')
    await settle()
    expect(status()).toBe('Keine Treffer für „nexy“')
    await act(async () => resolveOld(RESULTS))
    expect(status()).toBe('Keine Treffer für „nexy“')
    expect(options()).toHaveLength(0)
  })

  test('Enter, bevor die Treffer da sind: öffnet den ersten, sobald sie eintreffen - nicht den alten', async () => {
    api.search.mockResolvedValueOnce(EMPTY)
    render()
    open()
    type('ne')
    await settle()
    type('nele')
    key(input(), 'Enter')
    expect(where()).toBe('/start')
    await settle()
    expect(where()).toBe('/tier/1?in=1')
    expect(JSON.parse(window.localStorage.getItem('chronik.suche.verlauf.1'))).toEqual(['nele'])
  })
})

describe('Suche: Abkürzungen und Verlauf', () => {
  test('Abkürzungen passen lokal - Bilderrahmen öffnet die Seite, Einladen den Dialog', async () => {
    api.search.mockResolvedValue(EMPTY)
    render()
    open()
    type('diashow')
    expect(headings()).toEqual(['Abkürzungen'])
    // sofort sichtbar und per Pfeil wählbar - Enter ohne Auswahl wartet auf die Antwort des Servers
    key(input(), 'Enter')
    await settle()
    expect(where()).toBe('/bilderrahmen')
    open()
    type('einladen')
    act(() => options()[0].click())
    expect(onInvite).toHaveBeenCalledTimes(1)
    expect(dialog().open).toBe(false)
  })

  test('die letzten Suchen stehen vor dem Tippen da, lassen sich wählen und löschen', async () => {
    window.localStorage.setItem('chronik.suche.verlauf.1', JSON.stringify(['Strand', 'Benno']))
    render()
    open()
    expect(headings()).toEqual(['Zuletzt gesucht'])
    expect(options().map((option) => option.textContent)).toEqual(['Strand', 'Benno'])
    key(input(), 'ArrowDown')
    key(input(), 'ArrowDown')
    key(input(), 'Enter')
    expect(input().value).toBe('Benno')
    await settle()
    expect(api.search).toHaveBeenCalledWith('Benno')
    type('')
    act(() => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Verlauf löschen').click())
    expect(options()).toHaveLength(0)
    expect(window.localStorage.getItem('chronik.suche.verlauf.1')).toBeNull()
    expect(document.activeElement).toBe(input())
  })
})
