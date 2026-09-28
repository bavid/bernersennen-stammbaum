// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { me, logout, listDogs, recentActivity, discover } = vi.hoisted(() => ({
  me: vi.fn(),
  logout: vi.fn(),
  listDogs: vi.fn(),
  recentActivity: vi.fn(),
  discover: vi.fn()
}))
vi.mock('./api', () => ({
  api: { me, logout, listDogs, recentActivity, discover },
  setUnauthorizedHandler: () => {}
}))

import App from './App.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const home = {
  id: 1,
  name: 'Zuhause am Deich',
  theme: 'standard',
  art: 'zuhause',
  isDemo: false,
  home: null,
  memberships: []
}

const group = { ...home, id: 2, name: 'Rudel vom Heidekamp', art: 'rudel' }

const shelter = {
  id: 5,
  name: 'Tierheim Birkenweg',
  theme: 'standard',
  art: 'tierheim',
  isDemo: false,
  home: { id: 5, name: 'Tierheim Birkenweg', theme: 'standard', art: 'tierheim' },
  memberships: [],
  partner: { id: 1, slug: 'tierheim-birkenweg', name: 'Tierheim Birkenweg' }
}

const emptyDiscover = {
  fallback: { hundeschulen: false, begleiter: false },
  hundeschulen: [],
  begleiter: { partner: [], tiere: [] },
  futter: [],
  unterstuetzen: { gofundmeClickUrl: null, text: null, bericht: null, partnerSpenden: [] }
}

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
  delete document.documentElement.dataset.theme
  document.title = ''
  window.history.replaceState(null, '', '/')
  me.mockReset()
  logout.mockReset()
  listDogs.mockReset()
  recentActivity.mockReset()
  discover.mockReset()
  window.localStorage.clear()
  vi.restoreAllMocks()
})

async function render(family, initialEntry) {
  me.mockResolvedValue(family)
  listDogs.mockResolvedValue([])
  recentActivity.mockResolvedValue([])
  discover.mockResolvedValue(emptyDiscover)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <App />
      </MemoryRouter>
    )
  )
  return container
}

function navLabels() {
  return [...container.querySelectorAll('.app-nav a')].map((a) => a.textContent)
}

describe('Reiter "Entdecken" in der Hauptnavigation', () => {
  test('Zuhause: Wegbegleiter, Stammbaum, Pinnwand, Entdecken, Collage', async () => {
    await render(home, '/entdecken')
    expect(navLabels()).toEqual(['Wegbegleiter', 'Stammbaum', 'Pinnwand', 'Entdecken', 'Collage'])
  })

  test('Rudel: Stammbaum, Pinnwand, Würfe, Entdecken, Collage', async () => {
    await render(group, '/entdecken')
    expect(navLabels()).toEqual(['Stammbaum', 'Pinnwand', 'Würfe', 'Entdecken', 'Collage'])
  })

  test('Tierheim: Tiere, Pinnwand, Collage und (Phase P) Profil - kein Entdecken', async () => {
    await render(shelter, '/tiere')
    expect(navLabels()).toEqual(['Tiere', 'Pinnwand', 'Collage', 'Profil'])
  })

  test('mit fünf Einträgen bekommt die Leiste die kompakte Variante, mit vier nicht', async () => {
    await render(home, '/entdecken')
    expect(container.querySelector('.app-nav').classList.contains('app-nav-dense')).toBe(true)

    act(() => root.unmount())
    root = null
    container.remove()
    await render(shelter, '/tiere')
    expect(container.querySelector('.app-nav').classList.contains('app-nav-dense')).toBe(false)
  })

  test('"Entdecken" verlinkt auf /entdecken, ist dort aktiv und zeigt die Seite', async () => {
    await render(home, '/entdecken')
    const link = [...container.querySelectorAll('.app-nav a')].find((a) => a.textContent === 'Entdecken')
    expect(link.getAttribute('href')).toBe('/entdecken')
    expect(link.classList.contains('active')).toBe(true)
    expect(container.querySelector('h1').textContent).toBe('Entdecken')
    expect(discover).toHaveBeenCalledWith({})
  })

  test('ein Tierheim wird von /entdecken auf seine Startseite umgeleitet', async () => {
    await render(shelter, '/entdecken')
    expect(container.querySelector('h1').textContent).toBe('Unsere Tiere')
    expect(discover).not.toHaveBeenCalled()
  })
})
