// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { me, view, familyMembers } = vi.hoisted(() => ({ me: vi.fn(), view: vi.fn(), familyMembers: vi.fn() }))
vi.mock('./api', () => ({
  api: {
    me,
    view,
    familyMembers,
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

// Phase W: Einstellungen stehen im Konto-Menü (AccountMenu) statt als Zahnrad im Kopf.
function openMenu() {
  act(() => container.querySelector('.account-menu-trigger').click())
  return [...container.querySelectorAll('.account-menu-panel [role="menuitem"]')]
}
const menuItem = (label) => openMenu().find((item) => item.textContent === label)

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
  view.mockReset()
  familyMembers.mockReset()
})

describe('App – Einstellungen (Calm-down-Runde)', () => {
  test('„Einstellungen“ im Konto-Menü führt zu /einstellungen', async () => {
    me.mockResolvedValue(atHome)
    await render('/start')
    const link = menuItem('Einstellungen')
    expect(link.getAttribute('href')).toBe('/einstellungen')
    await act(async () => link.click())
    expect((await waitForMainHeading('Einstellungen')).textContent).toBe('Einstellungen')
    expect(container.querySelector('.account-menu-panel')).toBeNull()
  })

  test('die Darstellung aus /me gilt sofort an <html> und ist für das nächste Laden gemerkt', async () => {
    me.mockResolvedValue(atHome)
    await render('/start')
    const { dataset } = document.documentElement
    expect([dataset.palette, dataset.modus, dataset.schrift, dataset.scheme]).toEqual(['wald', 'dunkel', 'gross', 'dunkel'])
    expect(JSON.parse(window.localStorage.getItem('chronik.darstellung'))).toEqual(atHome.darstellung)
  })

  test('Demo: angewendet, aber nicht gemerkt', async () => {
    me.mockResolvedValue({ ...atHome, isDemo: true, darstellung: { palette: 'meer', modus: 'hell', schrift: 'normal' } })
    await render('/start')
    expect(document.documentElement.dataset.palette).toBe('meer')
    expect(window.localStorage.getItem('chronik.darstellung')).toBeNull()
  })

  test('Admin-Ansicht: angewendet, aber nicht gemerkt; nach dem Abmelden wieder die Wahl dieses Geräts', async () => {
    window.localStorage.setItem('chronik.darstellung', JSON.stringify({ palette: 'schiefer', modus: 'hell', schrift: 'normal' }))
    me.mockResolvedValue({ ...atHome, adminView: true, darstellung: { palette: 'lavendel', modus: 'dunkel', schrift: 'gross' } })
    await render('/start')
    expect(document.documentElement.dataset.palette).toBe('lavendel')
    expect(JSON.parse(window.localStorage.getItem('chronik.darstellung')).palette).toBe('schiefer')

    const logoutItem = menuItem('Abmelden')
    await act(async () => logoutItem.click())
    expect(document.documentElement.dataset.palette).toBe('schiefer')
    expect(document.documentElement.dataset.schrift).toBe('normal')
  })

  test('zu Besuch steht „Einstellungen“ im Menü (das Gate wechselt nach Hause); Partner-Bereiche haben kein Konto-Menü', async () => {
    me.mockResolvedValue({ ...atHome, id: 9, name: 'Zuhause Möwenweg', zuBesuch: true, role: 'gast' })
    await render('/familien/9')
    expect(menuItem('Einstellungen').getAttribute('href')).toBe('/einstellungen')
    act(() => root.unmount())
    container.remove()

    me.mockResolvedValue({ id: 20, name: 'Hundeschule Ufer', theme: 'standard', art: 'partner', isDemo: false, role: 'leitung', home: { id: 20, art: 'partner' }, memberships: [] })
    await render('/einstellungen')
    expect(container.querySelector('.account-menu')).toBeNull()
    expect(container.querySelector('main h1')?.textContent).not.toBe('Einstellungen')
  })
})

// Phase W, Schritt 2: Einstellungen › Familien › [Familie] spielt in der Familie - das Gate der Route wechselt dorthin.
describe('App – Familie verwalten in den Einstellungen', () => {
  const group = { id: 3, name: 'Familie Sonnenhang', theme: 'standard', rolle: 'leitung' }
  const meWithGroup = { ...atHome, memberships: [group], besuche: [{ id: 9, name: 'Zuhause Möwenweg' }] }

  test('?familie=<Mitgliedschaft> wechselt genau einmal in die Familie und zeigt „Familie verwalten“', async () => {
    me.mockResolvedValue(meWithGroup)
    view.mockResolvedValue({ ...meWithGroup, id: 3, name: 'Familie Sonnenhang', art: 'rudel' })
    familyMembers.mockResolvedValue({ familyId: 3, name: 'Familie Sonnenhang', ichBin: 'leitung', mitglieder: [] })
    await render('/einstellungen?bereich=familien&familie=3')
    await waitForMainHeading('Einstellungen')
    for (let i = 0; i < 40 && !container.querySelector('.family-manage-title'); i += 1) {
      await act(async () => new Promise((resolve) => setTimeout(resolve, 10)))
    }

    expect(view).toHaveBeenCalledTimes(1)
    expect(view).toHaveBeenCalledWith(3)
    expect(container.querySelector('.family-manage-title').textContent).toContain('Familie Sonnenhang')
  })

  test('ein besuchtes Zuhause oder eine fremde Id in ?familie= bleibt im eigenen Zuhause - ohne Wechsel', async () => {
    for (const id of [9, 77]) {
      me.mockResolvedValue(meWithGroup)
      await render(`/einstellungen?bereich=familien&familie=${id}`)
      await waitForMainHeading('Einstellungen')
      expect(view).not.toHaveBeenCalled()
      expect(container.querySelector('.family-manage')).toBeNull()
      act(() => root.unmount())
      root = null
      container.remove()
    }
  })
})
