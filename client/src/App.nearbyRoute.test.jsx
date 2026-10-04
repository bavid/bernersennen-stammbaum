// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { me, logout, listDogs, searchPlaces } = vi.hoisted(() => ({
  me: vi.fn(),
  logout: vi.fn(),
  listDogs: vi.fn(),
  searchPlaces: vi.fn()
}))
vi.mock('./api', () => ({
  api: { me, logout, listDogs, searchPlaces },
  setUnauthorizedHandler: () => {}
}))

import App from './App.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const loggedInHome = {
  id: 1,
  name: 'Zuhause am Deich',
  theme: 'standard',
  art: 'zuhause',
  isDemo: false,
  home: null,
  memberships: []
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
  searchPlaces.mockReset()
  window.localStorage.clear()
  vi.restoreAllMocks()
})

async function render(initialEntry) {
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

describe('Route /umgebung – "In der Nähe" innerhalb der angemeldeten App', () => {
  test('zeigt NearbyPage, kein Reiter in der Hauptnavigation', async () => {
    me.mockResolvedValue(loggedInHome)
    listDogs.mockResolvedValue([])
    await render('/umgebung')

    expect(container.querySelector('h1')?.textContent).toBe('Tierheime & Hundeschulen')
    expect([...container.querySelectorAll('.app-nav a')].some((a) => a.textContent.includes('Nähe'))).toBe(false)
  })

  // Phase W: im Fuß eines Haushalts nur noch Impressum und Datenschutz - "In der Nähe" erreicht man über Entdecken.
  test('der Fuß eines Haushalts verlinkt /umgebung nicht mehr, Tierheime und Partner behalten den Link', async () => {
    me.mockResolvedValue(loggedInHome)
    listDogs.mockResolvedValue([])
    await render('/start')
    expect([...container.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/umgebung')).toBe(false)
    act(() => root.unmount())
    root = null
    container.remove()

    me.mockResolvedValue({ id: 30, name: 'Hundeschule Wiesengrund', theme: 'standard', art: 'partner', isDemo: false, home: null, memberships: [], partner: { id: 4 } })
    await render('/umgebung')
    expect(container.querySelector('h1')?.textContent).toBe('Tierheime & Hundeschulen')
    expect([...container.querySelectorAll('.app-footer a')].some((a) => a.getAttribute('href') === '/umgebung')).toBe(false)
  })
})
