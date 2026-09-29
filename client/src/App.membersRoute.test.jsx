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

// Die Mitglieder-Seite ist ein eigener Chunk (React.lazy in AreaRoutes.jsx) - kurz warten, bis <main> sie zeigt.
async function waitForMainHeading() {
  for (let i = 0; i < 40 && !container.querySelector('main h1'); i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  }
  return container.querySelector('main h1')
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

describe('/mitglieder (Phase R)', () => {
  test('in einer Familie lädt die Mitglieder-Seite als eigener Chunk; der Kopf zeigt die Rolle neben dem Familiennamen', async () => {
    me.mockResolvedValue(groupAs('mitglied'))
    await render('/mitglieder')

    expect((await waitForMainHeading()).textContent).toBe('Mitglieder')
    expect(familyMembers).toHaveBeenCalledTimes(1)
    const trigger = container.querySelector('.context-switcher-trigger')
    expect(trigger.textContent).toContain('Familie Sonnenhang')
    expect(trigger.querySelector('.role-badge').textContent).toBe('Mitglied')
    // Die Rudel-Navigation bleibt bei ihren fünf Einträgen - kein sechster für Mitglieder
    expect([...container.querySelectorAll('.app-nav a')].map((a) => a.getAttribute('href'))).not.toContain('/mitglieder')
  })

  test('im eigenen Zuhause leitet /mitglieder auf die Start-Route um, der Kopf hat keinen Rollen-Chip', async () => {
    me.mockResolvedValue(atHome)
    await render('/mitglieder')

    expect((await waitForMainHeading()).textContent).toBe('Wegbegleiter')
    expect(familyMembers).not.toHaveBeenCalled()
    expect(container.querySelector('.context-switcher-trigger .role-badge')).toBeNull()
  })

  test('ein klassischer Rudel-Login (kein Zuhause) zeigt den Namen mit Rollen-Chip statt des Bereichswechslers', async () => {
    me.mockResolvedValue({ ...groupAs('leitung'), home: { id: 3, name: 'Familie Sonnenhang', theme: 'standard', art: 'rudel' }, memberships: [] })
    await render('/stammbaum')

    const sub = container.querySelector('.brand-sub')
    expect(sub.textContent).toContain('Familie Sonnenhang')
    expect(sub.querySelector('.role-badge').textContent).toBe('Familienleitung')
  })
})

describe('Fuß: "Jemanden einladen" je Rolle (Phase R)', () => {
  const inviteLink = () => [...container.querySelectorAll('.app-footer .footer-link')].find((el) => el.textContent === 'Jemanden einladen')

  test('Gast und Mitglied sehen den Knopf in einer Familie nicht', async () => {
    for (const role of ['gast', 'mitglied']) {
      me.mockResolvedValue(groupAs(role))
      await render('/stammbaum')
      expect(inviteLink()).toBeUndefined()
      act(() => root.unmount())
      root = null
      container.remove()
    }
  })

  test('Stellvertretung und Leitung sehen ihn, ebenso das eigene Zuhause', async () => {
    for (const family of [groupAs('stellvertretung'), groupAs('leitung'), atHome]) {
      me.mockResolvedValue(family)
      await render('/stammbaum')
      expect(inviteLink()).not.toBeUndefined()
      act(() => root.unmount())
      root = null
      container.remove()
    }
  })
})
