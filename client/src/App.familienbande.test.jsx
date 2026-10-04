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
const tabLabels = () => [...container.querySelectorAll('.animals-tab-bar [role="tab"]')].map((tab) => tab.textContent)
const selectedTab = () => container.querySelector('.animals-tab-bar [aria-selected="true"]')?.textContent

const nele = { id: 10, name: 'Nele', geschlecht: 'huendin', mother_dog_id: 11, father_dog_id: null, can_edit: 1 }
const mutter = { id: 11, name: 'Mia', geschlecht: 'huendin', can_edit: 1 }

// Phase W: Familienbande/Stammbaum heißen jetzt "Tiere" (Berner: "Hunde") - alte Adressen leiten dorthin weiter.
describe('Tiere in der App (Phase W, vorher Familienbande)', () => {
  test('/familienbande leitet zu Tiere, der Punkt "Tiere" ist aktiv', async () => {
    await render(group, '/familienbande')

    expect(container.querySelector('.page-hero h1').textContent).toBe('Tiere')
    expect(container.querySelector('.page-hero .eyebrow').textContent).toBe('Familie Sonnenhang')
    expect(activeNav()).toEqual(['Tiere'])
    expect(tabLabels()).toEqual(['Alle', 'Zeitleiste'])
  })

  test('/stammbaum?ansicht=stammbaum öffnet den Reiter "Stammbaum", sobald es einen gibt', async () => {
    api.listDogs.mockResolvedValue([nele, mutter])
    api.listAllDogs.mockResolvedValue([nele, mutter])
    await render(group, '/stammbaum?ansicht=stammbaum')
    expect(selectedTab()).toBe('Stammbaum')
    expect(container.querySelector('[data-testid="pedigree-tree"]')).not.toBeNull()
  })

  test('Standard: /wuerfe bleibt erreichbar, ohne eigenen Reiter - "Tiere" ist dort aktiv', async () => {
    await render(group, '/wuerfe')

    expect(container.querySelector('.page-hero .eyebrow').textContent).toBe('Nachwuchs')
    expect(navTargets()).not.toContain('/wuerfe')
    expect(activeNav()).toEqual(['Tiere'])
  })

  test('Berner: "Hunde" mit dem Reiter "Würfe"; /wuerfe markiert "Hunde"', async () => {
    await render({ ...group, theme: 'berner' }, '/tiere')
    expect(container.querySelector('.page-hero h1').textContent).toBe('Hunde')
    expect(tabLabels()).toEqual(['Alle', 'Zeitleiste', 'Würfe'])
    act(() => root.unmount())
    root = null
    container.remove()

    await render({ ...group, theme: 'berner' }, '/wuerfe')
    expect(container.querySelector('.page-hero .eyebrow').textContent).toBe('Würfe')
    expect(activeNav()).toEqual(['Hunde'])
  })

  test('Berner: mit Hunden steht der Stammbaum als Reiter da', async () => {
    api.listDogs.mockResolvedValue([mutter])
    await render({ ...group, theme: 'berner' }, '/familienbande')
    expect(tabLabels()).toEqual(['Alle', 'Zeitleiste', 'Stammbaum', 'Würfe'])
  })

  test('Standard: die Kopfzeile nennt nirgends "Stammbaum" oder "Würfe"', async () => {
    await render(group, '/tiere')
    expect(container.querySelector('.app-header').textContent).not.toMatch(/Stammbaum|Würfe/)
  })
})
