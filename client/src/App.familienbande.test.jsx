// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({
  me: vi.fn(),
  logout: vi.fn(),
  listDogs: vi.fn(),
  listAllDogs: vi.fn(),
  recentActivity: vi.fn(),
  listNotes: vi.fn(),
  listLinks: vi.fn(),
  listBreedingEvents: vi.fn(),
  listTimeline: vi.fn()
}))
vi.mock('./api', () => ({ api, setUnauthorizedHandler: () => {} }))
vi.mock('./components/PedigreeTree.jsx', () => ({ default: () => <div data-testid="pedigree-tree" /> }))

import App from './App.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const group = {
  id: 2,
  name: 'Familie Sonnenhang',
  theme: 'standard',
  art: 'rudel',
  role: 'leitung',
  isDemo: false,
  home: null,
  memberships: []
}

beforeEach(() => {
  for (const name of ['listDogs', 'listAllDogs', 'recentActivity', 'listNotes', 'listLinks', 'listBreedingEvents', 'listTimeline']) {
    api[name].mockResolvedValue([])
  }
})

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  for (const mock of Object.values(api)) mock.mockReset()
  delete document.documentElement.dataset.theme
  document.title = ''
  window.history.replaceState(null, '', '/')
})

async function render(family, path) {
  api.me.mockResolvedValue(family)
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
  return container
}

const activeNav = () => [...container.querySelectorAll('.app-nav a.active')].map((a) => a.textContent)
const navTargets = () => [...container.querySelectorAll('.app-nav a')].map((a) => a.getAttribute('href'))

describe('Familienbande und Nachwuchs in der App (Phase U)', () => {
  test('/familienbande zeigt dieselbe Seite wie /stammbaum, der Reiter "Familienbande" ist aktiv', async () => {
    await render(group, '/familienbande')

    expect(container.querySelector('.page-hero h1').textContent).toBe('Familie Sonnenhang')
    expect(container.querySelector('.page-hero .eyebrow').textContent).toBe('Familienbande')
    expect(activeNav()).toEqual(['Familienbande'])
  })

  test('/stammbaum bleibt erreichbar (Links, Lesezeichen)', async () => {
    await render(group, '/stammbaum')
    expect(container.querySelector('.page-hero .eyebrow').textContent).toBe('Familienbande')
    expect(activeNav()).toEqual(['Familienbande'])
  })

  test('Standard: /wuerfe bleibt erreichbar, ohne eigenen Reiter - "Familienbande" ist dort aktiv', async () => {
    await render(group, '/wuerfe')

    expect(container.querySelector('.page-hero .eyebrow').textContent).toBe('Nachwuchs')
    expect(navTargets()).not.toContain('/wuerfe')
    expect(activeNav()).toEqual(['Familienbande'])
  })

  test('Berner: "Würfe" ist ein eigener, aktiver Reiter', async () => {
    await render({ ...group, theme: 'berner' }, '/wuerfe')

    expect(container.querySelector('.page-hero .eyebrow').textContent).toBe('Würfe')
    expect(activeNav()).toEqual(['Würfe'])
  })

  test('Berner: /familienbande zeigt denselben Stammbaum, "Stammbaum" ist aktiv', async () => {
    await render({ ...group, theme: 'berner' }, '/familienbande')

    expect(container.querySelector('.page-hero .eyebrow').textContent).toBe('Stammbaum')
    expect(activeNav()).toEqual(['Stammbaum'])
  })

  test('Standard: die Kopfzeile nennt nirgends "Stammbaum" oder "Würfe"', async () => {
    await render(group, '/stammbaum')
    expect(container.querySelector('.app-header').textContent).not.toMatch(/Stammbaum|Würfe/)
  })
})
