// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { discover } = vi.hoisted(() => ({ discover: vi.fn() }))
vi.mock('../api', () => ({ api: { discover } }))

import DiscoverPage from './DiscoverPage.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
let currentSearch

// Liest die aktuelle Adresse mit, damit sich ?bereich= prüfen lässt.
function LocationProbe() {
  currentSearch = useLocation().search
  return null
}

beforeEach(() => {
  window.localStorage.clear()
  currentSearch = null
})

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
  discover.mockReset()
  window.localStorage.clear()
})

async function render({ path = '/entdecken', props = {} } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <DiscoverPage {...props} />
        <LocationProbe />
      </MemoryRouter>
    )
  )
}

// Fiktive Hundeschulen - fünf Stück, damit "Alle" kürzen muss.
function school(id, extra = {}) {
  return {
    id,
    kind: 'partner',
    slug: `hundeschule-${id}`,
    name: `Hundeschule Nummer ${id}`,
    typ: 'hundeschule',
    plz: '20095',
    ort: 'Hamburg',
    lat: null,
    lon: null,
    logoUrl: null,
    badge: 'partner',
    clickUrl: null,
    ...extra
  }
}

const futter = [1, 2].map((id) => ({
  id: 100 + id,
  kind: 'promotion',
  bereich: 'futter',
  kennzeichnung: 'Anzeige',
  empfohlenVon: null,
  titel: `Futterprobe ${id}`,
  text: null,
  bildUrl: null,
  clickUrl: `/r/promotion/${100 + id}`
}))

const response = {
  fallback: { hundeschulen: false, salon: false, begleiter: false },
  hundeschulen: [school(1), school(2), school(3), school(4), school(5)],
  salon: [],
  begleiter: { partner: [], tiere: [], promotions: [] },
  futter,
  unterstuetzen: { gofundmeClickUrl: null, text: null, bericht: null, partnerSpenden: [], promotions: [] }
}

function tabs() {
  return [...container.querySelectorAll('[role="tab"]')]
}

function tab(label) {
  return tabs().find((el) => el.firstChild.textContent === label)
}

function section(title) {
  return [...container.querySelectorAll('section[aria-labelledby]')].find(
    (el) => document.getElementById(el.getAttribute('aria-labelledby'))?.textContent === title
  )
}

function schoolNames() {
  return [...section('Hundeschulen').querySelectorAll('.partner-card h3')].map((h) => h.textContent)
}

async function press(key) {
  await act(async () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })))
}

describe('DiscoverPage – Reiter (Phase U)', () => {
  test('eine echte Tabliste mit sechs Reitern und Zählern; "Alle" ist gewählt und steuert das Panel', async () => {
    discover.mockResolvedValue(response)
    await render()

    expect(container.querySelector('[role="tablist"]').getAttribute('aria-label')).toBe('Bereiche')
    expect(tabs().map((el) => [el.firstChild.textContent, el.querySelector('.discover-tab-count').textContent])).toEqual([
      ['Alle', '7'],
      ['Hundeschulen', '5'],
      ['Salon & Betreuung', '0'],
      ['Neue Begleiter', '0'],
      ['Futter', '2'],
      ['Unterstützen', '0']
    ])
    expect(tab('Alle').getAttribute('aria-selected')).toBe('true')
    expect(tab('Alle').tabIndex).toBe(0)
    expect(tab('Futter').tabIndex).toBe(-1)
    const panel = container.querySelector('[role="tabpanel"]')
    expect(tab('Alle').getAttribute('aria-controls')).toBe(panel.id)
    expect(panel.getAttribute('aria-labelledby')).toBe(tab('Alle').id)
  })

  test('"Alle" zeigt je Bereich höchstens drei Einträge und "Alle anzeigen" mit der Gesamtzahl', async () => {
    discover.mockResolvedValue(response)
    await render()

    expect(schoolNames()).toEqual(['Hundeschule Nummer 1', 'Hundeschule Nummer 2', 'Hundeschule Nummer 3'])
    const showAll = section('Hundeschulen').querySelector('.discover-show-all')
    expect(showAll.textContent).toBe('Alle anzeigen: Hundeschulen5')
    // Futter hat nur zwei - dort gibt es nichts weiter anzuzeigen.
    expect(section('Futter').querySelector('.discover-show-all')).toBeNull()
  })

  test('"Alle anzeigen" wechselt den Reiter, schreibt ?bereich= in die Adresse und setzt den Fokus auf den Reiter', async () => {
    discover.mockResolvedValue(response)
    await render()

    await act(async () => section('Hundeschulen').querySelector('.discover-show-all').click())

    expect(currentSearch).toBe('?bereich=hundeschulen')
    expect(tab('Hundeschulen').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('Hundeschulen'))
    expect(schoolNames()).toHaveLength(5)
    expect(section('Futter')).toBeUndefined()
    expect(section('Hundeschulen').querySelector('.discover-show-all')).toBeNull()
  })

  test('ein Reiter aus der Adresse ist gleich gewählt; ein unbekannter Wert fällt auf "Alle" zurück', async () => {
    discover.mockResolvedValue(response)
    await render({ path: '/entdecken?bereich=futter' })
    expect(tab('Futter').getAttribute('aria-selected')).toBe('true')
    expect([...container.querySelectorAll('section h2')].map((h) => h.textContent)).toEqual(['Futter'])

    act(() => root.unmount())
    root = null
    container.remove()
    await render({ path: '/entdecken?bereich=zucht' })
    expect(tab('Alle').getAttribute('aria-selected')).toBe('true')
  })

  test('zurück auf "Alle" nimmt den Parameter aus der Adresse', async () => {
    discover.mockResolvedValue(response)
    await render({ path: '/entdecken?bereich=futter' })
    await act(async () => tab('Alle').click())
    expect(currentSearch).toBe('')
  })

  test('Pfeiltasten, Pos1 und Ende wechseln Reiter und Fokus', async () => {
    discover.mockResolvedValue(response)
    await render()
    act(() => tab('Alle').focus())

    await press('ArrowRight')
    expect(document.activeElement).toBe(tab('Hundeschulen'))
    expect(tab('Hundeschulen').getAttribute('aria-selected')).toBe('true')
    expect(currentSearch).toBe('?bereich=hundeschulen')

    await press('End')
    expect(document.activeElement).toBe(tab('Unterstützen'))
    await press('ArrowRight')
    expect(document.activeElement).toBe(tab('Alle'))
    await press('ArrowLeft')
    expect(document.activeElement).toBe(tab('Unterstützen'))
    await press('Home')
    expect(tab('Alle').getAttribute('aria-selected')).toBe('true')
  })

  test('der Umkreis-Fallback bleibt: "Weiter weg" auch unter "Alle"', async () => {
    discover.mockResolvedValue({
      ...response,
      fallback: { hundeschulen: true, salon: false, begleiter: false },
      hundeschulen: [school(1, { distanceKm: 2.1 }), school(2, { distanceKm: 48.5, ausserhalb: true })]
    })
    await render()
    const el = section('Hundeschulen')
    expect(el.querySelector('.discover-fallback-note')).not.toBeNull()
    expect(el.querySelector('.discover-far').textContent).toContain('Hundeschule Nummer 2')
  })

  test('Kundensicht: Reiterwechsel ohne Adress-Änderung, die eigene Karte bleibt unter "Alle" sichtbar', async () => {
    const load = vi.fn().mockResolvedValue({ ...response, hundeschulen: [...response.hundeschulen, school(9, { name: 'Unsere Schule', vorschau: true })] })
    await render({ path: '/kundensicht', props: { load, preview: true } })

    expect(schoolNames()).toEqual(['Hundeschule Nummer 1', 'Hundeschule Nummer 2', 'Hundeschule Nummer 3', 'Unsere Schule'])
    expect(section('Hundeschulen').querySelector('.is-own-preview h3').textContent).toBe('Unsere Schule')

    await act(async () => tab('Futter').click())
    expect(tab('Futter').getAttribute('aria-selected')).toBe('true')
    expect(currentSearch).toBe('')
  })

  test('in "Entdecken" behalten Anzeigen ihr "Anzeige"-Badge - eins je Karte', async () => {
    discover.mockResolvedValue(response)
    await render({ path: '/entdecken?bereich=futter' })
    const cards = [...section('Futter').querySelectorAll('.promotion-card')]
    expect(cards.map((card) => card.querySelectorAll('.promotion-badge').length)).toEqual([1, 1])
    expect(cards.every((card) => card.querySelector('.promotion-badge').textContent === 'Anzeige')).toBe(true)
  })

  test('Alt+Pfeil (Zurück im Browser) wechselt keinen Reiter', async () => {
    discover.mockResolvedValue(response)
    await render()
    act(() => tab('Alle').focus())
    await act(async () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true })))
    expect(tab('Alle').getAttribute('aria-selected')).toBe('true')
    expect(currentSearch).toBe('')
  })

  test('der Zähler steht für Screenreader als "n Einträge" im Namen des Reiters', async () => {
    discover.mockResolvedValue(response)
    await render()
    expect(tab('Hundeschulen').textContent).toBe('Hundeschulen5 (5 Einträge)')
    expect(tab('Hundeschulen').querySelector('.discover-tab-count').getAttribute('aria-hidden')).toBe('true')
  })
})
