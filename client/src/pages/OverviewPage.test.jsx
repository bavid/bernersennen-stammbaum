// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { listDogs, listAllDogs, recentActivity, listNotes, listLinks } = vi.hoisted(() => ({
  listDogs: vi.fn(),
  listAllDogs: vi.fn(),
  recentActivity: vi.fn(),
  listNotes: vi.fn(),
  listLinks: vi.fn()
}))

vi.mock('../api', () => ({ api: { listDogs, listAllDogs, recentActivity, listNotes, listLinks } }))

import OverviewPage from './OverviewPage.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom implementiert <dialog> nicht vollständig (kein showModal/close) – das Modal "Neues Tier" ruft beides auf.
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

// OverviewPage steht seit Phase W nur noch im Tierheim (/stammbaum, /familienbande - AreaRoutes ShelterRoutes).
const shelter = {
  id: 30,
  name: 'Tierheim Kleeblatt',
  theme: 'standard',
  art: 'tierheim',
  role: 'leitung',
  isDemo: false,
  home: { id: 30, name: 'Tierheim Kleeblatt', theme: 'standard', art: 'tierheim' },
  memberships: []
}

async function render(family = shelter) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <OverviewPage family={family} onFamilyChange={() => {}} onInvite={() => {}} />
      </MemoryRouter>
    )
  )
  return container
}

const buttonWith = (text) => [...container.querySelectorAll('button')].find((btn) => btn.textContent.includes(text))

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
  for (const mock of [listDogs, listAllDogs, recentActivity, listNotes, listLinks]) mock.mockReset()
})

describe('OverviewPage – Familienbande des Tierheims', () => {
  // Audit V7a: ohne Tiere nur EIN Knopf zum Anlegen - "Erstes Tier anlegen" im Leerzustand, nicht noch "Tier hinzufügen" oben.
  test('ohne Tiere: "Erstes Tier anlegen" (einmal) und "Jemanden einladen"; kein Weg zu Mitglieder & Rollen', async () => {
    await render()
    expect(buttonWith('Erstes Tier anlegen')).not.toBeUndefined()
    expect(buttonWith('Tier hinzufügen')).toBeUndefined()
    expect(buttonWith('Jemanden einladen')).not.toBeUndefined()
    expect(container.querySelector('a[href="/mitglieder"]')).toBeNull()
  })

  test('kein Stift am Namen (Phase W, Schritt 2): Name und Aussehen stehen im Profil', async () => {
    await render()
    expect(container.querySelector('h1').textContent).toBe('Tierheim Kleeblatt')
    expect(container.querySelector('.title-edit')).toBeNull()
    expect(container.querySelector('.family-settings')).toBeNull()
  })
})
