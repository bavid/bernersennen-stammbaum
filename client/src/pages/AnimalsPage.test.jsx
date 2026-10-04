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
  listTimeline: vi.fn()
}))
vi.mock('../api', () => ({ api }))
vi.mock('../components/PedigreeTree.jsx', () => ({ default: () => <div data-testid="pedigree-tree" /> }))

import AnimalsPage from './AnimalsPage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'

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
const atHome = { ...home, home, role: 'leitung', memberships: [{ id: 5, name: 'Familie Sonnenhang', rolle: 'mitglied' }] }
const dog = (id, name, extra = {}) => ({ id, name, name_unbekannt: 0, tierart: 'hund', geschlecht: 'huendin', foto_url: null, can_edit: 1, ...extra })

function Where() {
  const { search } = useLocation()
  return <output data-testid="search">{search}</output>
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-28T12:00:00Z'))
  api.listDogs.mockResolvedValue([])
  api.listAllDogs.mockResolvedValue([])
  api.listLinks.mockResolvedValue([])
  api.listBreedingEvents.mockResolvedValue([])
  api.listTimeline.mockResolvedValue([])
})

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
  for (const mock of Object.values(api)) mock.mockReset()
  vi.useRealTimers()
})

async function render({ family = atHome, path = '/tiere', themeId = 'standard' } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <ThemeProvider themeId={themeId}>
          <Routes>
            <Route
              path="/tiere"
              element={
                <>
                  <AnimalsPage family={family} />
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

const tabs = () => [...container.querySelectorAll('.animals-tab-bar [role="tab"]')]
const tabLabels = () => tabs().map((tab) => tab.textContent)
const selected = () => container.querySelector('.animals-tab-bar [aria-selected="true"]').textContent
const panel = () => container.querySelector('.animals-panel')

describe('AnimalsPage (Phase W)', () => {
  test('Kopf: "Mein Zuhause" und "Tiere", genau ein Knopf "Tier hinzufügen" - kein Einladen, keine Kennzahlen, kein Stift', async () => {
    api.listDogs.mockResolvedValue([dog(10, 'Nele')])
    await render()

    expect(container.querySelector('.eyebrow').textContent).toBe('Mein Zuhause')
    expect(container.querySelector('h1').textContent).toBe('Tiere')
    const buttons = [...container.querySelectorAll('button')].filter((button) => button.textContent.includes('hinzufügen'))
    expect(buttons.map((button) => button.textContent)).toEqual(['Tier hinzufügen'])
    expect(container.textContent).not.toMatch(/einladen|Mitglieder/)
    expect(container.querySelector('.stats')).toBeNull()
    expect(container.querySelector('.title-edit')).toBeNull()
    expect(container.querySelector('.feed')).toBeNull()
  })

  test('Reiter "Alle": das Raster ohne die Zeile zu Familien; Reiter-Muster mit Panel', async () => {
    api.listDogs.mockResolvedValue([dog(10, 'Nele'), dog(11, 'Flocke')])
    await render()

    expect(tabLabels()).toEqual(['Alle', 'Zeitleiste'])
    expect(selected()).toBe('Alle')
    expect(panel().getAttribute('role')).toBe('tabpanel')
    expect(panel().getAttribute('aria-labelledby')).toBe('tiere-tab-alle')
    expect(container.querySelectorAll('.families-grid li')).toHaveLength(2)
    expect(container.querySelector('.families-links')).toBeNull()
  })

  test('Reiter "Zeitleiste" (früher Wegbegleiter) aus der Adresse und per Klick; die Adresse merkt ihn', async () => {
    api.listDogs.mockResolvedValue([dog(10, 'Nele', { bei_uns_seit: '2016-09-20' })])
    await render({ path: '/tiere?ansicht=zeitleiste' })
    expect(selected()).toBe('Zeitleiste')
    expect(container.querySelector('.companion-timeline')).not.toBeNull()

    act(() => tabs()[0].click())
    expect(selected()).toBe('Alle')
    expect(container.querySelector('[data-testid="search"]').textContent).toBe('')
    act(() => tabs()[1].click())
    expect(container.querySelector('[data-testid="search"]').textContent).toBe('?ansicht=zeitleiste')
  })

  test('Zeitleiste ohne Datum: freundlicher Leerzustand', async () => {
    api.listDogs.mockResolvedValue([dog(10, 'Ohne Datum')])
    await render({ path: '/tiere?ansicht=zeitleiste' })
    expect(panel().querySelector('.empty-state h3').textContent).toBe('Noch keine Zeitleiste')
  })

  test('"Stammbaum" erst mit Eltern (Standard) - dann mit dem Baum; ?ansicht=stammbaum wartet auf die Daten', async () => {
    const mutter = dog(11, 'Mia')
    const nele = dog(10, 'Nele', { mother_dog_id: 11 })
    api.listDogs.mockResolvedValue([nele, mutter])
    api.listAllDogs.mockResolvedValue([nele, mutter])
    await render({ path: '/tiere?ansicht=stammbaum' })

    expect(tabLabels()).toEqual(['Alle', 'Zeitleiste', 'Stammbaum'])
    expect(selected()).toBe('Stammbaum')
    expect(container.querySelector('[data-testid="pedigree-tree"]')).not.toBeNull()
  })

  test('ohne Baum fällt ?ansicht=stammbaum auf "Alle" zurück', async () => {
    api.listDogs.mockResolvedValue([dog(10, 'Nele')])
    await render({ path: '/tiere?ansicht=stammbaum' })
    expect(tabLabels()).toEqual(['Alle', 'Zeitleiste'])
    expect(selected()).toBe('Alle')
  })

  test('Berner: "Hunde" mit Stammbaum und Würfen', async () => {
    api.listDogs.mockResolvedValue([dog(10, 'Nele')])
    await render({ themeId: 'berner' })
    expect(container.querySelector('h1').textContent).toBe('Hunde')
    expect(tabLabels()).toEqual(['Alle', 'Zeitleiste', 'Stammbaum', 'Würfe'])
  })

  test('ohne Tiere: der erste Schritt im Leerzustand, oben kein zweiter Knopf; öffnet "Neues Tier anlegen"', async () => {
    await render()
    expect(container.querySelector('.hero-actions')).toBeNull()
    const first = [...panel().querySelectorAll('button')].find((button) => button.textContent === 'Erstes Tier anlegen')
    act(() => first.click())
    const dialog = container.querySelector('dialog.modal')
    expect(dialog.open).toBe(true)
    expect(dialog.querySelector('#modal-title').textContent).toBe('Neues Tier anlegen')
  })

  test('Gast in einer Familie (klassischer Login): kein Anlegen', async () => {
    const classicGuest = { id: 2, name: 'Rudel vom Heidekamp', art: 'rudel', role: 'gast', home: { id: 2, art: 'rudel' } }
    await render({ family: classicGuest })
    expect(container.querySelector('.eyebrow').textContent).toBe('Rudel vom Heidekamp')
    expect(container.textContent).not.toContain('Erstes Tier anlegen')
  })
})
