// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { community } = vi.hoisted(() => ({ community: vi.fn() }))
vi.mock('../api', () => ({ api: { community } }))

import CommunityTicker from './CommunityTicker.jsx'
import { TICKER_LEER } from '../lib/community.js'

// Laufband „Zahlen aus der Gemeinschaft“: Bewegung, Anhalten, weniger Bewegung, Nullen und Fehler.
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const DATA = {
  familien: 10,
  zuhause: 4,
  erinnerungen: 200,
  fotos: 80,
  partner: 3,
  spendenCents: 50000,
  partnerVorgestellt: [{ slug: 'hundeschule-pfotenglueck', name: 'Hundeschule Pfotenglück', typ: 'hundeschule' }]
}
const ZERO = { familien: 0, zuhause: 0, erinnerungen: 0, fotos: 0, partner: 0, spendenCents: 0, partnerVorgestellt: [] }

let container
let root

function unmount() {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
}

afterEach(() => {
  unmount()
  community.mockReset()
  delete window.matchMedia
})

function mockReducedMotion() {
  window.matchMedia = (query) => ({ matches: query.includes('reduce'), addEventListener() {}, removeEventListener() {} })
}

async function render(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <CommunityTicker {...props} />
      </MemoryRouter>
    )
  )
}

const region = () => container.querySelector('[role="region"]')

describe('CommunityTicker', () => {
  test('läuft: Region mit Namen, Band aria-hidden mit doppeltem Inhalt, Satz einmal für Screenreader, Links nicht fokussierbar', async () => {
    community.mockResolvedValue(DATA)
    await render()
    expect(region().getAttribute('aria-label')).toBe('Zahlen aus der Gemeinschaft')
    expect(region().getAttribute('aria-live')).toBeNull()
    const viewport = container.querySelector('.community-ticker-viewport')
    expect(viewport.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelectorAll('.community-ticker-list')).toHaveLength(2)
    expect(container.querySelector('.community-ticker-track').style.getPropertyValue('--ticker-duration')).toMatch(/^\d+s$/)
    expect(container.querySelector('.visually-hidden').textContent).toMatch(
      /^Dabei sind 10 Familien, 4 Zuhause, 200 Erinnerungen, 80 Fotos, 500\s€ Spenden, 3 Partner, Partner des Monats: Hundeschule Pfotenglück\.$/
    )
    for (const link of viewport.querySelectorAll('a')) expect(link.getAttribute('tabindex')).toBe('-1')
    expect(viewport.querySelector('a').getAttribute('href')).toBe('/p/hundeschule-pfotenglueck')
  })

  test('Anhalten: Knopf mit aria-label, danach ruhige Zeile mit allen Einträgen und erreichbarem Partner-Link; wieder abspielen', async () => {
    community.mockResolvedValue(DATA)
    await render()
    const toggle = container.querySelector('.community-ticker-toggle')
    expect(toggle.getAttribute('aria-label')).toBe('Laufband anhalten')
    await act(async () => toggle.click())
    expect(container.querySelector('.community-ticker-viewport')).toBeNull()
    const items = [...container.querySelectorAll('.community-ticker-static li')]
    expect(items).toHaveLength(7)
    expect(items.at(-1).querySelector('a').getAttribute('tabindex')).toBeNull()
    expect(container.querySelector('.community-ticker-toggle').getAttribute('aria-label')).toBe('Laufband abspielen')
    await act(async () => container.querySelector('.community-ticker-toggle').click())
    expect(container.querySelector('.community-ticker-viewport')).not.toBeNull()
  })

  test('weniger Bewegung: keine Animation, kein Abspielknopf, die ersten vier Einträge und „mehr“', async () => {
    mockReducedMotion()
    community.mockResolvedValue(DATA)
    await render()
    expect(container.querySelector('.community-ticker-viewport')).toBeNull()
    expect(container.querySelector('.community-ticker-toggle')).toBeNull()
    expect(container.querySelectorAll('.community-ticker-static li')).toHaveLength(4)
    const more = container.querySelector('.community-ticker-more')
    expect(more.getAttribute('aria-expanded')).toBe('false')
    await act(async () => more.click())
    expect(container.querySelectorAll('.community-ticker-static li')).toHaveLength(7)
    expect(more.getAttribute('aria-expanded')).toBe('true')
  })

  test('Nullen fallen weg; alles 0: nichts - nur mit fallback (Startseite) „Gerade starten wir“; Fehler: nichts', async () => {
    community.mockResolvedValue({ ...ZERO, erinnerungen: 3 })
    await render()
    expect(container.querySelector('.visually-hidden').textContent).toBe('3 Erinnerungen.')
    unmount()

    community.mockResolvedValue(ZERO)
    await render()
    expect(region()).toBeNull()
    unmount()

    community.mockResolvedValue(ZERO)
    await render({ fallback: true })
    expect(region().textContent).toContain(TICKER_LEER)
    expect(container.querySelector('.community-ticker-toggle')).toBeNull()
    unmount()

    community.mockRejectedValue(new Error('kaputt'))
    await render({ fallback: true })
    expect(region()).toBeNull()
  })
})
