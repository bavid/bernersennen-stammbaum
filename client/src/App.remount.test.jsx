// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { me, view, listDogs, listAllDogs, recentActivity, listNotes, listLinks } = vi.hoisted(() => ({
  me: vi.fn(),
  view: vi.fn(),
  listDogs: vi.fn(),
  listAllDogs: vi.fn(),
  recentActivity: vi.fn(),
  listNotes: vi.fn(),
  listLinks: vi.fn()
}))

vi.mock('./api', () => ({
  api: { me, view, listDogs, listAllDogs, recentActivity, listNotes, listLinks },
  setUnauthorizedHandler: () => {}
}))

import App from './App.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const groupA = { id: 2, name: 'Familie Sonnenhang', theme: 'standard' }
const groupB = { id: 3, name: 'Familie Nachbarn', theme: 'standard' }
const home = { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause' }

const meInGroupA = { ...groupA, art: 'rudel', isDemo: false, home, memberships: [groupA, groupB] }
const meInGroupB = { ...groupB, art: 'rudel', isDemo: false, home, memberships: [groupA, groupB] }
const meAtHome = { ...home, isDemo: false, home, memberships: [groupA, groupB] }

async function render(initialEntry = '/stammbaum') {
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

beforeEach(() => {
  listDogs.mockResolvedValue([])
  listAllDogs.mockResolvedValue([])
  recentActivity.mockResolvedValue([])
  listNotes.mockResolvedValue([])
  listLinks.mockResolvedValue([])
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
  delete document.documentElement.dataset.theme
  document.title = ''
  me.mockReset()
  view.mockReset()
  listDogs.mockReset()
  listAllDogs.mockReset()
  recentActivity.mockReset()
  listNotes.mockReset()
  listLinks.mockReset()
})

function trigger() {
  return container.querySelector('.context-switcher-trigger')
}

function items() {
  return [...container.querySelectorAll('[role="menuitem"]')]
}

describe('Bereichswechsel während man auf /stammbaum bleibt (gleiche Route vorher/nachher)', () => {
  test('lädt die Stammbaum-Daten des neuen Bereichs neu, statt die alten stehen zu lassen', async () => {
    me.mockResolvedValue(meInGroupA)
    view.mockResolvedValue(meInGroupB)
    await render('/stammbaum')

    expect(container.querySelector('h1').textContent).toBe('Familie Sonnenhang')
    expect(listDogs).toHaveBeenCalledTimes(1)

    act(() => trigger().click())
    const target = items().find((item) => item.textContent === 'Familie Nachbarn')
    await act(async () => target.click())

    // Selbe Route (/stammbaum -> /stammbaum) – trotzdem müssen die Daten des neuen Bereichs neu geladen werden
    expect(listDogs).toHaveBeenCalledTimes(2)
    expect(container.querySelector('h1').textContent).toBe('Familie Nachbarn')
  })
})

describe('/wegbegleiter nur für Haushalte', () => {
  test('ein aktives Rudel wird von /wegbegleiter zur eigenen Start-Route (Stammbaum) umgeleitet', async () => {
    me.mockResolvedValue(meInGroupA)
    await render('/wegbegleiter')

    expect(container.querySelector('h1').textContent).toBe('Familie Sonnenhang')
    expect(container.querySelector('.companions-hint')).toBeNull()
  })

  test('das eigene Zuhause darf /wegbegleiter weiter aufrufen', async () => {
    me.mockResolvedValue(meAtHome)
    await render('/wegbegleiter')

    expect(container.querySelector('h1').textContent).toBe('Wegbegleiter')
  })
})
