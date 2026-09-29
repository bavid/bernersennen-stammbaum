// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { listDogs, listAllDogs, recentActivity, listNotes, listLinks, renameFamily, listUsers } = vi.hoisted(() => ({
  listDogs: vi.fn(),
  listAllDogs: vi.fn(),
  recentActivity: vi.fn(),
  listNotes: vi.fn(),
  listLinks: vi.fn(),
  renameFamily: vi.fn(),
  listUsers: vi.fn()
}))

vi.mock('../api', () => ({ api: { listDogs, listAllDogs, recentActivity, listNotes, listLinks, renameFamily, listUsers } }))

import OverviewPage from './OverviewPage.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom implementiert <dialog> nicht vollständig (kein showModal/close) – das Einstellungen-Modal ruft
// beides beim Öffnen/Schließen auf.
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

const homeFamily = {
  id: 1,
  name: 'Zuhause am Deich',
  theme: 'standard',
  art: 'zuhause',
  isDemo: false,
  home: { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause' },
  memberships: []
}

async function render(family = homeFamily, onFamilyChange = () => {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <OverviewPage family={family} onFamilyChange={onFamilyChange} onInvite={() => {}} />
      </MemoryRouter>
    )
  )
  return container
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
  listDogs.mockReset()
  listAllDogs.mockReset()
  recentActivity.mockReset()
  listNotes.mockReset()
  listLinks.mockReset()
  renameFamily.mockReset()
  listUsers.mockReset()
})

describe('OverviewPage – Rechte je Rolle in einer Familie (Phase R)', () => {
  const groupAs = (role) => ({
    id: 3,
    name: 'Familie Sonnenhang',
    theme: 'standard',
    art: 'rudel',
    isDemo: false,
    role,
    home: homeFamily.home,
    memberships: [{ id: 3, name: 'Familie Sonnenhang', theme: 'standard', rolle: role }]
  })
  const buttonWith = (text) => [...container.querySelectorAll('button')].find((btn) => btn.textContent.includes(text))

  function mockEmpty() {
    listDogs.mockResolvedValue([])
    listAllDogs.mockResolvedValue([])
    recentActivity.mockResolvedValue([])
    listNotes.mockResolvedValue([])
    listLinks.mockResolvedValue([])
  }

  test('Gast: weder "Tier hinzufügen" noch "Jemanden einladen", der leere Stammbaum lädt nicht zum Anlegen ein', async () => {
    mockEmpty()
    await render(groupAs('gast'))
    expect(buttonWith('Tier hinzufügen')).toBeUndefined()
    expect(buttonWith('Jemanden einladen')).toBeUndefined()
    expect(buttonWith('Erstes Tier anlegen')).toBeUndefined()
    expect(container.querySelector('.empty-state').textContent).toContain('Sobald Mitglieder Tiere anlegen')
    expect(container.querySelector('a[href="/mitglieder"]').textContent).toContain('Mitglieder & Rollen')
  })

  test('Mitglied: "Tier hinzufügen", aber kein "Jemanden einladen"', async () => {
    mockEmpty()
    await render(groupAs('mitglied'))
    expect(buttonWith('Tier hinzufügen')).not.toBeUndefined()
    expect(buttonWith('Erstes Tier anlegen')).not.toBeUndefined()
    expect(buttonWith('Jemanden einladen')).toBeUndefined()
  })

  test('Stellvertretung: beides', async () => {
    mockEmpty()
    await render(groupAs('stellvertretung'))
    expect(buttonWith('Tier hinzufügen')).not.toBeUndefined()
    expect(buttonWith('Jemanden einladen')).not.toBeUndefined()
  })

  test('das eigene Zuhause hat beides und keinen Mitglieder-Link', async () => {
    mockEmpty()
    await render(homeFamily)
    expect(buttonWith('Tier hinzufügen')).not.toBeUndefined()
    expect(buttonWith('Jemanden einladen')).not.toBeUndefined()
    expect(container.querySelector('a[href="/mitglieder"]')).toBeNull()
  })
})

describe('OverviewPage – Umbenennen des eigenen Zuhauses', () => {
  test('aktualisiert auch family.home.name, wenn der aktive Bereich das eigene Zuhause ist', async () => {
    listDogs.mockResolvedValue([])
    listAllDogs.mockResolvedValue([])
    recentActivity.mockResolvedValue([])
    listNotes.mockResolvedValue([])
    listLinks.mockResolvedValue([])
    renameFamily.mockResolvedValue({ id: 1, name: 'Zuhause an der Förde', theme: 'standard' })
    listUsers.mockResolvedValue([])
    const onFamilyChange = vi.fn()

    await render(homeFamily, onFamilyChange)

    act(() => container.querySelector('.title-edit').click())

    const input = container.querySelector('#family-rename')
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    act(() => {
      nativeInputValueSetter.call(input, 'Zuhause an der Förde')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const form = container.querySelector('.family-settings form')
    // Erster Submit scharf schalten, zweiter bestätigt (ConfirmButton/RenameFamilyForm-Muster)
    await act(async () => form.requestSubmit())
    await act(async () => form.requestSubmit())

    expect(renameFamily).toHaveBeenCalledWith('Zuhause an der Förde')
    expect(onFamilyChange).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Zuhause an der Förde',
        home: expect.objectContaining({ id: 1, name: 'Zuhause an der Förde' })
      })
    )
  })
})
