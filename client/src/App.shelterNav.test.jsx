// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { me, logout, listDogs, recentActivity } = vi.hoisted(() => ({
  me: vi.fn(),
  logout: vi.fn(),
  listDogs: vi.fn(),
  recentActivity: vi.fn()
}))
vi.mock('./api', () => ({
  api: { me, logout, listDogs, recentActivity },
  setUnauthorizedHandler: () => {}
}))

import App from './App.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const shelterFamily = {
  id: 5,
  name: 'Tierheim Sonnenhang',
  theme: 'standard',
  art: 'tierheim',
  isDemo: false,
  home: { id: 5, name: 'Tierheim Sonnenhang', theme: 'standard', art: 'tierheim' },
  memberships: [],
  partner: { id: 1, slug: 'tierheim-sonnenhang', name: 'Tierheim Sonnenhang' }
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

describe('Navigation für Tierheime (family.art === "tierheim")', () => {
  test('die Hauptnavigation zeigt Tiere, Pinnwand, Collage, Profil - kein Stammbaum/Wegbegleiter/Würfe', async () => {
    me.mockResolvedValue(shelterFamily)
    listDogs.mockResolvedValue([])
    recentActivity.mockResolvedValue([])
    await render('/tiere')

    const labels = [...container.querySelectorAll('.app-nav a')].map((a) => a.textContent)
    expect(labels).toEqual(['Tiere', 'Pinnwand', 'Collage', 'Profil'])
    expect(labels.length).toBeLessThanOrEqual(5)
  })

  test('"Profil" (Phase P) zeigt den Platzhalter mit Name und Status des Tierheim-Partners', async () => {
    me.mockResolvedValue({ ...shelterFamily, partner: { ...shelterFamily.partner, status: 'aktiv', gesperrt: false } })
    await render('/profil')

    const link = [...container.querySelectorAll('.app-nav a')].find((a) => a.textContent === 'Profil')
    expect(link.getAttribute('href')).toBe('/profil')
    expect(link.classList.contains('active')).toBe(true)
    expect(container.querySelector('h1').textContent).toBe('Tierheim Sonnenhang')
    expect(container.querySelector('.partner-status-chip').textContent).toBe('Aktiv')
    expect(container.textContent).toContain('Hier pflegt ihr bald euer Profil.')
  })

  test('ohne "Zugang" in der Leiste verlinkt das Profil eines Tierheims auf /zugang', async () => {
    me.mockResolvedValue(shelterFamily)
    await render('/profil')

    const link = [...container.querySelectorAll('main a')].find((a) => a.textContent.includes('Zugang'))
    expect(link.getAttribute('href')).toBe('/zugang')
  })

  test('"Tiere" verlinkt auf /tiere', async () => {
    me.mockResolvedValue(shelterFamily)
    listDogs.mockResolvedValue([])
    recentActivity.mockResolvedValue([])
    await render('/tiere')

    const link = [...container.querySelectorAll('.app-nav a')].find((a) => a.textContent === 'Tiere')
    expect(link.getAttribute('href')).toBe('/tiere')
    expect(link.classList.contains('active')).toBe(true)
  })

  test('eine unbekannte Route leitet auf die Startseite eines Tierheims (/tiere) um', async () => {
    me.mockResolvedValue(shelterFamily)
    listDogs.mockResolvedValue([])
    recentActivity.mockResolvedValue([])
    await render('/irgendwas')

    expect(container.querySelector('h1').textContent).toBe('Unsere Tiere')
  })

  test('/wegbegleiter ist für ein Tierheim nicht erreichbar und leitet auf /tiere um', async () => {
    me.mockResolvedValue(shelterFamily)
    listDogs.mockResolvedValue([])
    recentActivity.mockResolvedValue([])
    await render('/wegbegleiter')

    expect(container.querySelector('h1').textContent).toBe('Unsere Tiere')
  })
})
