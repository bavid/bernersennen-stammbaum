// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { me, view, myVouchers, voucherLimit, familyMembers, listDogs, listAllDogs, recentActivity, listNotes, listLinks } = vi.hoisted(() => ({
  me: vi.fn(),
  view: vi.fn(),
  myVouchers: vi.fn(),
  voucherLimit: vi.fn(),
  familyMembers: vi.fn(),
  listDogs: vi.fn(),
  listAllDogs: vi.fn(),
  recentActivity: vi.fn(),
  listNotes: vi.fn(),
  listLinks: vi.fn()
}))

vi.mock('./api', () => ({
  api: { me, view, myVouchers, voucherLimit, logout: vi.fn(), familyMembers, listDogs, listAllDogs, recentActivity, listNotes, listLinks },
  setUnauthorizedHandler: () => {}
}))

import App from './App.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom kennt showModal/close am <dialog> nicht - der Einladen-Dialog ruft beides auf.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close() {
    this.open = false
  }
}

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
  for (const mock of [me, view, myVouchers, voucherLimit, familyMembers, listDogs, listAllDogs, recentActivity, listNotes, listLinks]) mock.mockReset()
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

// Phase W, Schritt 2: "Einladen" im Menü lädt aus dem eigenen Zuhause ein - jede Rolle in einer Familie sieht es.
describe('Menü: "Einladen" (Phase R, Phase W)', () => {
  test('jede Rolle in einer Familie und das eigene Zuhause sehen es', async () => {
    for (const [family, path] of [
      [groupAs('gast'), '/familien/3'],
      [groupAs('mitglied'), '/familien/3'],
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

// Phase W, Schritt 2: "Einladen" im Konto-Menü lädt aus dem eigenen Zuhause ein - aus einer Familie heraus erst nach Start
// (ein Wechsel über das Gate), dann die zwei Wege.
describe('Menü „Einladen“ aus einer Familie heraus', () => {
  test('wechselt einmal nach Hause und zeigt „Zu Besuch einladen“ / „Zuhause verschenken“', async () => {
    me.mockResolvedValue(groupAs('mitglied'))
    view.mockResolvedValue(atHome)
    myVouchers.mockResolvedValue([])
    voucherLimit.mockResolvedValue({ offen: 0, max: 5, frei: 5 })
    await render('/familien/3')

    act(() => container.querySelector('.account-menu-trigger').click())
    const invite = [...container.querySelectorAll('.account-menu-panel [role="menuitem"]')].find((item) => item.textContent === 'Einladen')
    await act(async () => invite.click())
    await waitFor(() => container.querySelector('.invite-choice-option'))

    expect(view).toHaveBeenCalledTimes(1)
    expect(view).toHaveBeenCalledWith(1)
    const dialog = container.querySelector('dialog[open]')
    expect(dialog.querySelector('#modal-title').textContent).toBe('Einladen')
    expect([...dialog.querySelectorAll('.invite-choice-title')].map((el) => el.textContent)).toEqual(['Zu Besuch einladen', 'Zuhause verschenken'])
  })

  test('scheitert der Wechsel nach Hause, öffnet kein leerer Dialog (code-review W2)', async () => {
    me.mockResolvedValue(groupAs('mitglied'))
    view.mockRejectedValue(new Error('Das hat nicht geklappt'))
    await render('/familien/3')

    act(() => container.querySelector('.account-menu-trigger').click())
    const invite = [...container.querySelectorAll('.account-menu-panel [role="menuitem"]')].find((item) => item.textContent === 'Einladen')
    await act(async () => invite.click())
    await waitFor(() => container.querySelector('[role="alert"]'))

    expect(view).toHaveBeenCalledTimes(1)
    expect(container.querySelector('dialog[open]')).toBeNull()
  })
})
