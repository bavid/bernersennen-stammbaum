// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { me } = vi.hoisted(() => ({ me: vi.fn() }))
vi.mock('./api', () => ({
  api: {
    me,
    logout: vi.fn(() => Promise.resolve()),
    listDogs: vi.fn(() => Promise.resolve([])),
    listAllDogs: vi.fn(() => Promise.resolve([])),
    recentActivity: vi.fn(() => Promise.resolve([])),
    listNotes: vi.fn(() => Promise.resolve([])),
    listLinks: vi.fn(() => Promise.resolve([])),
    listBreedingEvents: vi.fn(() => Promise.resolve([])),
    visits: vi.fn(() => Promise.resolve({ besuche: [], gaeste: [] })),
    erlebtMitOffen: vi.fn(() => Promise.resolve([])),
    erlebtMitTiere: vi.fn(() => Promise.resolve([]))
  },
  setUnauthorizedHandler: () => {}
}))

import App from './App.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const home = { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause' }
const atHome = {
  ...home,
  isDemo: false,
  role: 'leitung',
  home,
  memberships: [],
  besuche: [],
  darstellung: { palette: 'wald', modus: 'dunkel', schrift: 'gross' }
}

let container
let root

async function render(path) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    )
  )
}

// Die Einstellungen sind ein eigener Chunk (React.lazy in AreaRoutes.jsx) - kurz warten, bis <main> sie zeigt.
async function waitForMainHeading(text) {
  for (let i = 0; i < 40 && container.querySelector('main h1')?.textContent !== text; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  }
  return container.querySelector('main h1')
}

const gear = () => container.querySelector('.app-header a[href="/einstellungen"]')

beforeEach(() => {
  window.localStorage.clear()
  for (const key of ['palette', 'modus', 'schrift', 'scheme']) delete document.documentElement.dataset[key]
})

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
  me.mockReset()
})

describe('App – Einstellungen (Calm-down-Runde)', () => {
  test('das Zahnrad im Kopf führt zu /einstellungen', async () => {
    me.mockResolvedValue(atHome)
    await render('/einstellungen')
    expect(gear().getAttribute('aria-label')).toBe('Einstellungen')
    expect(gear().classList.contains('active')).toBe(true)
    expect(gear().getAttribute('aria-current')).toBe('page')
    expect((await waitForMainHeading('Einstellungen')).textContent).toBe('Einstellungen')
  })

  test('die Darstellung aus /me gilt sofort an <html> und ist für das nächste Laden gemerkt', async () => {
    me.mockResolvedValue(atHome)
    await render('/wegbegleiter')
    const { dataset } = document.documentElement
    expect([dataset.palette, dataset.modus, dataset.schrift, dataset.scheme]).toEqual(['wald', 'dunkel', 'gross', 'dunkel'])
    expect(JSON.parse(window.localStorage.getItem('chronik.darstellung'))).toEqual(atHome.darstellung)
  })

  test('Demo: angewendet, aber nicht gemerkt', async () => {
    me.mockResolvedValue({ ...atHome, isDemo: true, darstellung: { palette: 'meer', modus: 'hell', schrift: 'normal' } })
    await render('/wegbegleiter')
    expect(document.documentElement.dataset.palette).toBe('meer')
    expect(window.localStorage.getItem('chronik.darstellung')).toBeNull()
  })

  test('Admin-Ansicht: angewendet, aber nicht gemerkt; nach dem Abmelden wieder die Wahl dieses Geräts', async () => {
    window.localStorage.setItem('chronik.darstellung', JSON.stringify({ palette: 'schiefer', modus: 'hell', schrift: 'normal' }))
    me.mockResolvedValue({ ...atHome, adminView: true, darstellung: { palette: 'lavendel', modus: 'dunkel', schrift: 'gross' } })
    await render('/wegbegleiter')
    expect(document.documentElement.dataset.palette).toBe('lavendel')
    expect(JSON.parse(window.localStorage.getItem('chronik.darstellung')).palette).toBe('schiefer')

    await act(async () => container.querySelector('.app-logout').click())
    expect(document.documentElement.dataset.palette).toBe('schiefer')
    expect(document.documentElement.dataset.schrift).toBe('normal')
  })

  test('kein Zahnrad zu Besuch und in Partner-Bereichen; dort führt /einstellungen zur Startseite', async () => {
    me.mockResolvedValue({ ...atHome, id: 9, name: 'Zuhause Möwenweg', zuBesuch: true, role: 'gast' })
    await render('/wegbegleiter')
    expect(gear()).toBeNull()
    act(() => root.unmount())
    container.remove()

    me.mockResolvedValue({ id: 20, name: 'Hundeschule Ufer', theme: 'standard', art: 'partner', isDemo: false, role: 'leitung', home: { id: 20, art: 'partner' }, memberships: [] })
    await render('/einstellungen')
    expect(gear()).toBeNull()
    expect(container.querySelector('main h1')?.textContent).not.toBe('Einstellungen')
  })
})
