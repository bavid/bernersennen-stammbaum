// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({
  listDogs: vi.fn(),
  listAllDogs: vi.fn(),
  listLinks: vi.fn(),
  listBreedingEvents: vi.fn(),
  recentActivity: vi.fn(),
  listNotes: vi.fn(),
  familyMembers: vi.fn(),
  erlebtMitTiere: vi.fn()
}))
vi.mock('../api', () => ({ api }))
vi.mock('../components/PedigreeTree.jsx', () => ({ default: () => <div data-testid="pedigree-tree" /> }))

import GroupPage from './GroupPage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'
import { getTheme } from '../themes/index.js'

const words = getTheme('standard').words

globalThis.IS_REACT_ACT_ENVIRONMENT = true

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

const home = { id: 1, name: 'Zuhause Lindenhof', art: 'zuhause' }
const inGroup = { id: 5, name: 'Familie Sonnenhang', art: 'rudel', role: 'mitglied', home, memberships: [{ id: 5, name: 'Familie Sonnenhang', rolle: 'mitglied' }] }
const visiting = { id: 9, name: 'Zuhause Möwenweg', art: 'zuhause', zuBesuch: true, role: 'gast', home, memberships: [] }
const dog = (id, name, extra = {}) => ({ id, name, name_unbekannt: 0, tierart: 'hund', geschlecht: 'huendin', foto_url: null, can_edit: 0, ...extra })
const entry = (id) => ({ id, dog_id: 10, dog_name: 'Nele', titel: `Beitrag ${id}`, autor_name: 'Mara', created_at: '2026-09-27 10:00:00', comment_count: 0 })

function Where() {
  const { search } = useLocation()
  return <output data-testid="search">{search}</output>
}

beforeEach(() => {
  api.listDogs.mockResolvedValue([
    dog(10, 'Nele', { shared_from: 'Zuhause Lindenhof', family_id: 1 }),
    dog(11, 'Flocke', { shared_from: 'Zuhause am Deich', family_id: 3 }),
    dog(12, 'Hausi', { can_edit: 1 })
  ])
  api.listAllDogs.mockResolvedValue([])
  api.listLinks.mockResolvedValue([])
  api.listBreedingEvents.mockResolvedValue([])
  api.recentActivity.mockResolvedValue(Array.from({ length: 25 }, (_, index) => entry(index + 1)))
  api.listNotes.mockResolvedValue([
    { id: 1, text: 'Geschwistertreffen', termin_datum: '2099-10-12', termin_zeit: null, autor_name: 'Mara', created_at: '2026-09-27 10:00:00', replies: [] }
  ])
  api.familyMembers.mockResolvedValue({ familyId: 5, name: 'Familie Sonnenhang', ichBin: 'mitglied', mitglieder: [], einladungen: [] })
  api.erlebtMitTiere.mockResolvedValue([])
})

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
  for (const mock of Object.values(api)) mock.mockReset()
})

async function render(family = inGroup, path = `/familien/${family.id}`) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <ThemeProvider themeId="standard">
          <Routes>
            <Route
              path="/familien/:id"
              element={
                <>
                  <GroupPage family={family} onFamilyChange={() => {}} />
                  <Where />
                </>
              }
            />
          </Routes>
        </ThemeProvider>
      </MemoryRouter>
    )
  )
}

const groupTabs = () => [...container.querySelectorAll('.group-tab-bar [role="tab"]')]
const selected = () => container.querySelector('.group-tab-bar [aria-selected="true"]').textContent
const search = () => container.querySelector('[data-testid="search"]').textContent

async function waitFor(check) {
  for (let i = 0; i < 40 && !check(); i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  }
}

describe('GroupPage (Phase W)', () => {
  test('Kopf: Name, kleine Zeile mit Tieren und Zuhause, "Familie verwalten"; Reiter Beiträge · Tiere · Pinnwand · Mitglieder', async () => {
    await render()
    expect(container.querySelector('.eyebrow').textContent).toBe('Familie')
    expect(container.querySelector('h1').textContent).toBe('Familie Sonnenhang')
    expect(container.querySelector('.group-meta').textContent).toBe('3 Tiere · aus 2 Zuhause')
    expect(groupTabs().map((tab) => tab.textContent)).toEqual([words.entries, 'Tiere', 'Pinnwand', 'Mitglieder'])
    expect(selected()).toBe(words.entries)
  })

  test('Beiträge: der nächste Termin führt zum Reiter Pinnwand, bis zu 20 Kacheln; erzählen für die eigenen Tiere der Familie', async () => {
    await render()
    expect(api.recentActivity).toHaveBeenCalledWith(20)
    expect(container.querySelector('.feed-termin').getAttribute('href')).toBe('/familien/5?reiter=pinnwand')
    expect(container.querySelectorAll('.feed-item:not(.feed-termin)')).toHaveLength(19)
    const choices = [...container.querySelectorAll('.start-composer-animal')].map((button) => button.querySelector(':scope > span').textContent)
    expect(choices).toEqual(['Hausi'])
  })

  test('Reiter aus der Adresse; beim Wechsel fallen die Unter-Reiter der Tiere weg', async () => {
    await render(inGroup, '/familien/5?reiter=tiere&ansicht=zeitleiste')
    expect(selected()).toBe('Tiere')
    expect(container.querySelector('.animals-tab-bar [aria-selected="true"]').textContent).toBe('Zeitleiste')
    act(() => groupTabs()[2].click())
    expect(search()).toBe('?reiter=pinnwand')
    act(() => groupTabs()[0].click())
    expect(search()).toBe('')
  })

  test('Pinnwand ohne eigenen Seitenkopf', async () => {
    await render(inGroup, '/familien/5?reiter=pinnwand')
    expect(container.querySelector('.pinboard-embedded')).not.toBeNull()
    expect([...container.querySelectorAll('h1')].map((h) => h.textContent)).toEqual(['Familie Sonnenhang'])
  })

  test('Mitglieder (eigener Chunk) ohne eigenen Seitenkopf', async () => {
    await render(inGroup, '/familien/5?reiter=mitglieder')
    await waitFor(() => container.querySelector('.members-embedded'))
    expect(api.familyMembers).toHaveBeenCalledTimes(1)
    expect([...container.querySelectorAll('h1')].map((h) => h.textContent)).toEqual(['Familie Sonnenhang'])
  })

  test('"Familie verwalten" öffnet den Dialog der Familie', async () => {
    await render()
    act(() => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Familie verwalten').click())
    const dialog = container.querySelector('dialog[open]')
    expect(dialog.querySelector('#modal-title').textContent).toBe('Familie einstellen')
  })
})

describe('GroupPage zu Besuch (Phase W)', () => {
  test('nur lesen: Beiträge · Tiere · Zeitleiste, nichts verwalten, nichts erzählen, keine Pinnwand', async () => {
    await render(visiting)
    expect(container.querySelector('.eyebrow').textContent).toBe('Befreundetes Zuhause')
    expect(groupTabs().map((tab) => tab.textContent)).toEqual([words.entries, 'Tiere', 'Zeitleiste'])
    expect(container.textContent).not.toContain('verwalten')
    expect(container.querySelector('.start-composer')).toBeNull()
    expect(api.listNotes).not.toHaveBeenCalled()
    expect(container.querySelector('.feed-termin')).toBeNull()
  })

  test('Tiere ohne eigenen Reiter Zeitleiste; die Zeitleiste sagt "hier"', async () => {
    api.listDogs.mockResolvedValue([dog(20, 'Wilma', { bei_uns_seit: '2020-06-01' })])
    await render(visiting, '/familien/9?reiter=tiere')
    expect([...container.querySelectorAll('.animals-tab-bar [role="tab"]')].map((tab) => tab.textContent)).toEqual(['Alle'])
    act(() => groupTabs()[2].click())
    expect(container.querySelector('.companion-link').getAttribute('aria-label')).toBe('Wilma, hier seit 1. Juni 2020')
  })
})
