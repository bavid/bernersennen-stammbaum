// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { me, familyMembers, listDogs, listAllDogs, recentActivity, listNotes, listLinks } = vi.hoisted(() => ({
  me: vi.fn(),
  familyMembers: vi.fn(),
  listDogs: vi.fn(),
  listAllDogs: vi.fn(),
  recentActivity: vi.fn(),
  listNotes: vi.fn(),
  listLinks: vi.fn()
}))

vi.mock('./api', () => ({
  api: { me, logout: vi.fn(), familyMembers, listDogs, listAllDogs, recentActivity, listNotes, listLinks },
  setUnauthorizedHandler: () => {}
}))

import App from './App.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const home = { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause' }
const groupAs = (role) => ({
  id: 3,
  name: 'Familie Sonnenhang',
  theme: 'standard',
  art: 'rudel',
  isDemo: false,
  role,
  home,
  memberships: [{ id: 3, name: 'Familie Sonnenhang', theme: 'standard', rolle: role }],
  auth: { kind: 'key' }
})
const atHome = { ...home, isDemo: false, role: 'leitung', home, memberships: [{ id: 3, name: 'Familie Sonnenhang', theme: 'standard', rolle: 'mitglied' }] }

const payload = {
  familyId: 3,
  name: 'Familie Sonnenhang',
  ichBin: 'mitglied',
  mitglieder: [{ familyId: 1, name: 'Zuhause am Deich', rolle: 'mitglied', seit: '2026-01-05 10:00:00', geteilteTiere: 0 }]
}

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
  return container
}

// Die Mitglieder-Seite ist ein eigener Chunk (React.lazy) - kurz warten, bis <main> zeigt, was der Test erwartet.
async function waitFor(check) {
  for (let i = 0; i < 40 && !check(); i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  }
}

async function waitForMainHeading() {
  await waitFor(() => container.querySelector('main h1'))
  return container.querySelector('main h1')
}

const menuItems = () => {
  act(() => container.querySelector('.account-menu-trigger').click())
  return [...container.querySelectorAll('.account-menu-panel [role="menuitem"]')].map((item) => item.textContent)
}

beforeEach(() => {
  familyMembers.mockResolvedValue(payload)
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
  container?.remove()
  container = null
  delete document.documentElement.dataset.theme
  document.title = ''
  for (const mock of [me, familyMembers, listDogs, listAllDogs, recentActivity, listNotes, listLinks]) mock.mockReset()
})

// Phase W: für Haushalte sind die Mitglieder ein Reiter der Gruppenseite; nur der klassische Login hat die eigene Seite.
describe('/mitglieder (Phase R, Phase W)', () => {
  test('in einer Familie: alte Adresse -> Gruppenseite, Reiter "Mitglieder" (eigener Chunk)', async () => {
    me.mockResolvedValue(groupAs('mitglied'))
    await render('/mitglieder')
    await waitFor(() => familyMembers.mock.calls.length > 0 && container.querySelector('.members-embedded'))

    expect(container.querySelector('main h1').textContent).toBe('Familie Sonnenhang')
    expect(container.querySelector('.group-tab-bar [aria-selected="true"]').textContent).toBe('Mitglieder')
    expect(familyMembers).toHaveBeenCalledTimes(1)
    expect([...container.querySelectorAll('.app-nav a')].map((a) => a.getAttribute('href'))).not.toContain('/mitglieder')
  })

  test('im eigenen Zuhause führt /mitglieder zur Familien-Liste', async () => {
    me.mockResolvedValue(atHome)
    await render('/mitglieder')

    expect((await waitForMainHeading()).textContent).toBe('Familien')
    expect(familyMembers).not.toHaveBeenCalled()
  })

  test('ein klassischer Rudel-Login (kein Zuhause) zeigt den Namen mit Rollen-Chip und die Seite "Mitglieder" im Menü', async () => {
    const classic = { ...groupAs('leitung'), home: { id: 3, name: 'Familie Sonnenhang', theme: 'standard', art: 'rudel' }, memberships: [] }
    me.mockResolvedValue(classic)
    await render('/mitglieder')

    expect((await waitForMainHeading()).textContent).toBe('Mitglieder')
    const sub = container.querySelector('.brand-sub')
    expect(sub.textContent).toContain('Familie Sonnenhang')
    expect(sub.querySelector('.role-badge').textContent).toBe('Familienleitung')
    expect(menuItems()).toContain('Mitglieder')
  })
})

describe('Menü: "Einladen" je Rolle (Phase R, Phase W)', () => {
  test('Gast und Mitglied sehen es in einer Familie nicht', async () => {
    for (const role of ['gast', 'mitglied']) {
      me.mockResolvedValue(groupAs(role))
      await render('/familien/3')
      expect(menuItems()).not.toContain('Einladen')
      act(() => root.unmount())
      root = null
      container.remove()
    }
  })

  test('Stellvertretung und Leitung sehen es, ebenso das eigene Zuhause', async () => {
    for (const [family, path] of [
      [groupAs('stellvertretung'), '/familien/3'],
      [groupAs('leitung'), '/familien/3'],
      [atHome, '/start']
    ]) {
      me.mockResolvedValue(family)
      await render(path)
      expect(menuItems()).toContain('Einladen')
      act(() => root.unmount())
      root = null
      container.remove()
    }
  })
})
