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
  listTimeline: vi.fn(),
  tiere: vi.fn()
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

// GET /api/tiere: jedes Tier mit seinem Bereich (area) und - bei fremden - wo es wohnt (zuhause).
const homeArea = { id: 1, name: 'Zuhause Lindenhof', art: 'eigen' }
const familyArea = { id: 5, name: 'Familie Sonnenhang', art: 'familie' }
const visitArea = { id: 9, name: 'Zuhause Möwenweg (Demo)', art: 'besuch' }
const tier = (id, name, area, extra = {}) => ({ ...dog(id, name), area, zuhause: null, letzte_erinnerung: null, auch_in: [], ...extra })
// areas[].anzahl wie der Server (lib/allAnimals.js): alle Tiere, die der Bereich zeigt - einsortierte und die aus auch_in.
const allAnimals = (tiere, areas = [homeArea]) => ({
  tiere,
  areas: areas.map((area) => ({
    ...area,
    anzahl: tiere.filter((animal) => animal.area.id === area.id || animal.auch_in.includes(area.id)).length
  }))
})
const mixed = allAnimals(
  [
    tier(10, 'Nele', homeArea, { letzte_erinnerung: '2026-09-20' }),
    tier(11, 'Flocke', homeArea, { bei_uns_bis: '2025-01-01', abschied_grund: 'verstorben' }),
    tier(20, 'Lotte', familyArea, { zuhause: 'Familie Sonnenhang' }),
    tier(21, 'Benno', familyArea, { zuhause: 'Zuhause Heidekamp' }),
    tier(30, 'Dorle', visitArea, { zuhause: 'Zuhause Möwenweg (Demo)' })
  ],
  [homeArea, familyArea, visitArea, { id: 12, name: 'Familie Ohne Tiere', art: 'familie' }]
)


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
  api.tiere.mockResolvedValue(allAnimals([]))
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
    api.tiere.mockResolvedValue(allAnimals([tier(10, 'Nele', homeArea), tier(11, 'Flocke', homeArea)]))
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

const chips = () => [...container.querySelectorAll('.family-filter button')]
const chipText = (chip) => chip.textContent.replace(/\s+/g, ' ').trim()
const tiles = () => [...container.querySelectorAll('.animal-tile')]
const tileNames = () => tiles().map((tile) => tile.querySelector('.animal-tile-name').textContent)
const searchText = () => container.querySelector('[data-testid="search"]').textContent

describe('AnimalsPage › Alle: alle Tiere aus Zuhause, Familien und Besuchen (Phase W, Schritt 4)', () => {
  test('ein Raster aus GET /api/tiere; Filter je Bereich mit Tieren, mit Zahl - Bereiche ohne Tiere nicht', async () => {
    api.tiere.mockResolvedValue(mixed)
    await render()

    expect(api.tiere).toHaveBeenCalledTimes(1)
    expect(tileNames()).toEqual(['Nele', 'Flocke', 'Lotte', 'Benno', 'Dorle'])
    expect(chips().map(chipText)).toEqual(['Alle 5', 'Mein Zuhause 2', 'Familie Sonnenhang 2', 'Zuhause Möwenweg 1'])
    expect(chips()[3].getAttribute('title')).toBe('Zuhause Möwenweg (Demo)')
    expect(chips().map((chip) => chip.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false'])
    const grid = container.querySelector('.animal-grid-list')
    expect(chips().every((chip) => chip.getAttribute('aria-controls') === grid.id)).toBe(true)
  })

  test('Filter in der Adresse (?gruppe=): Klick wählt, Alle hebt auf; aus der Adresse gleich gefiltert', async () => {
    api.tiere.mockResolvedValue(mixed)
    await render({ path: '/tiere?gruppe=5' })
    expect(tileNames()).toEqual(['Lotte', 'Benno'])
    expect(chips()[2].getAttribute('aria-pressed')).toBe('true')

    act(() => chips()[1].click())
    expect(searchText()).toBe('?gruppe=eigen')
    expect(tileNames()).toEqual(['Nele', 'Flocke'])
    act(() => chips()[3].click())
    expect(searchText()).toBe('?gruppe=9')
    expect(tileNames()).toEqual(['Dorle'])
    act(() => chips()[0].click())
    expect(searchText()).toBe('')
    expect(tiles()).toHaveLength(5)
  })

  test('unbekannte Gruppe in der Adresse: alle Tiere', async () => {
    api.tiere.mockResolvedValue(mixed)
    await render({ path: '/tiere?gruppe=77' })
    expect(tiles()).toHaveLength(5)
    expect(chips()[0].getAttribute('aria-pressed')).toBe('true')
  })

  test('nur Tiere aus einem Bereich: kein Filter', async () => {
    api.tiere.mockResolvedValue(allAnimals([tier(10, 'Nele', homeArea)], [homeArea, familyArea]))
    await render()
    expect(tiles()).toHaveLength(1)
    expect(container.querySelector('.family-filter')).toBeNull()
  })

  test('Herkunft nur an fremden Tieren; Links in den Bereich des Tiers (eigene ohne ?in)', async () => {
    api.tiere.mockResolvedValue(mixed)
    await render()
    const origin = (index) => tiles()[index].querySelector('.animal-tile-origin')
    expect(origin(0)).toBeNull()
    expect(origin(2).textContent).toBe('aus Familie Sonnenhang')
    expect(origin(3).textContent).toContain('aus Zuhause Heidekamp')
    expect(origin(3).getAttribute('title')).toBe('geteilt in Familie Sonnenhang')
    expect(origin(4).textContent).toBe('aus Zuhause Möwenweg (Demo)')
    expect(origin(4).className).toContain('is-besuch')
    expect(tiles().map((tile) => tile.getAttribute('href'))).toEqual([
      '/tier/10',
      '/tier/11',
      '/tier/20?in=5',
      '/tier/21?in=5',
      '/tier/30?in=9'
    ])
  })

  test('gefiltert nach einem Bereich: keine doppelte Herkunft für dessen eigene Tiere', async () => {
    api.tiere.mockResolvedValue(mixed)
    await render({ path: '/tiere?gruppe=5' })
    expect(tiles()[0].querySelector('.animal-tile-origin')).toBeNull()
    expect(tiles()[1].querySelector('.animal-tile-origin').textContent).toContain('aus Zuhause Heidekamp')
  })

  // Audit W, M5: die Familie zählt wie ihre Karte („21 Tiere · davon 3 von euch“) - mit den eigenen, dorthin geteilten
  // Tieren (auch_in); in „Alle“ steht jedes trotzdem nur einmal, unter „Mein Zuhause“.
  test('eigene, in die Familie geteilte Tiere: zählen im Familien-Chip mit und erscheinen unter dem Filter - ohne Herkunft', async () => {
    const shared = allAnimals(
      [
        tier(10, 'Nele', homeArea, { auch_in: [5] }),
        tier(11, 'Flocke', homeArea),
        tier(20, 'Lotte', familyArea, { zuhause: 'Familie Sonnenhang' })
      ],
      [homeArea, familyArea]
    )
    api.tiere.mockResolvedValue(shared)
    await render()
    expect(tileNames()).toEqual(['Nele', 'Flocke', 'Lotte'])
    expect(chips().map(chipText)).toEqual(['Alle 3', 'Mein Zuhause 2', 'Familie Sonnenhang 2'])

    act(() => chips()[2].click())
    expect(tileNames()).toEqual(['Nele', 'Lotte'])
    expect(tiles()[0].querySelector('.animal-tile-origin')).toBeNull()
    expect(tiles()[0].getAttribute('href')).toBe('/tier/10')
    act(() => chips()[1].click())
    expect(tileNames()).toEqual(['Nele', 'Flocke'])
  })

  test('verstorbene Tiere „In Erinnerung“, die letzte Erinnerung leise darunter', async () => {
    api.tiere.mockResolvedValue(mixed)
    await render()
    expect(tiles()[1].className).toContain('is-memorial')
    expect(tiles()[1].querySelector('.animal-tile-note').textContent).toBe('In Erinnerung')
    expect(tiles()[0].querySelector('.animal-tile-last').textContent).toBe('Zuletzt: 20. September 2026')
    expect(tiles()[2].querySelector('.animal-tile-last')).toBeNull()
  })

  test('noch kein eigenes Tier, aber welche aus Familien: Raster und oben "Tier hinzufügen" (nur ins eigene Zuhause)', async () => {
    api.tiere.mockResolvedValue(allAnimals([tier(20, 'Lotte', familyArea)], [homeArea, familyArea]))
    await render()
    expect(tileNames()).toEqual(['Lotte'])
    const add = container.querySelector('.hero-actions button')
    expect(add.textContent).toBe('Tier hinzufügen')
    act(() => add.click())
    expect(container.querySelector('dialog.modal #modal-title').textContent).toBe('Neues Tier anlegen')
  })

  test('Laden gescheitert: Hinweis mit "Noch einmal versuchen" - lädt erneut', async () => {
    api.tiere.mockRejectedValueOnce(new Error('Netz weg'))
    await render()
    const alert = panel().querySelector('[role="alert"]')
    expect(alert.textContent).toContain('Netz weg')
    api.tiere.mockResolvedValue(mixed)
    const retry = [...alert.querySelectorAll('button')].find((button) => button.textContent === 'Noch einmal versuchen')
    await act(async () => retry.click())
    expect(api.tiere).toHaveBeenCalledTimes(2)
    expect(tiles()).toHaveLength(5)
  })

  test('Zeitleiste bleibt beim eigenen Zuhause (GET /api/dogs)', async () => {
    api.tiere.mockResolvedValue(mixed)
    api.listDogs.mockResolvedValue([dog(10, 'Nele', { bei_uns_seit: '2016-09-20' })])
    await render({ path: '/tiere?ansicht=zeitleiste' })
    expect(container.querySelectorAll('.companion-link')).toHaveLength(1)
    expect(container.textContent).not.toContain('Lotte')
  })
})
