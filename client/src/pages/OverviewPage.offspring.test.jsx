// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({
  listDogs: vi.fn(),
  listAllDogs: vi.fn(),
  recentActivity: vi.fn(),
  listNotes: vi.fn(),
  listLinks: vi.fn(),
  listBreedingEvents: vi.fn()
}))
vi.mock('../api', () => ({ api }))
// Der Baum selbst braucht Layout-APIs (ResizeObserver), die jsdom nicht hat - hier geht es nur um die Seite drumherum.
vi.mock('../components/PedigreeTree.jsx', () => ({ default: () => <div data-testid="pedigree-tree" /> }))

import OverviewPage from './OverviewPage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const family = {
  id: 2,
  name: 'Familie Sonnenhang',
  theme: 'standard',
  art: 'rudel',
  role: 'leitung',
  isDemo: false,
  home: null,
  memberships: []
}

const dog = (id, name, extra = {}) => ({ id, name, geschlecht: 'huendin', tierart: 'hund', geburtsdatum: '2016-03-02', ...extra })
const parents = [dog(1, 'Frieda'), dog(2, 'Anton', { geschlecht: 'ruede' })]
const siblings = [
  dog(3, 'Paula', { mother_dog_id: 1, father_dog_id: 2, geburtsdatum: '2021-04-18' }),
  dog(4, 'Moritz', { geschlecht: 'ruede', mother_dog_id: 1, father_dog_id: 2, geburtsdatum: '2021-04-18' })
]
const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
const plannedEvent = { id: 7, mutter_dog_id: 1, mutter_name: 'Frieda', vater_dog_id: 2, vater_name: 'Anton', datum: daysAgo(10), foto_urls: [] }

beforeEach(() => {
  api.listAllDogs.mockResolvedValue([])
  api.recentActivity.mockResolvedValue([])
  api.listNotes.mockResolvedValue([])
  api.listLinks.mockResolvedValue([])
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
})

async function render({ themeId = 'standard', dogs = [...parents, ...siblings], events = [] } = {}) {
  api.listDogs.mockResolvedValue(dogs)
  if (events instanceof Error) api.listBreedingEvents.mockRejectedValue(events)
  else api.listBreedingEvents.mockResolvedValue(events)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <ThemeProvider themeId={themeId}>
          <OverviewPage family={{ ...family, theme: themeId }} onFamilyChange={() => {}} onInvite={() => {}} />
        </ThemeProvider>
      </MemoryRouter>
    )
  )
  return container
}

const section = () => container.querySelector('.offspring-section')

describe('Familienbande – Abschnitt "Nachwuchs" (Phase U, Standard-Auftritt)', () => {
  test('mit Geschwistern: Abschnitt mit Titel, Eltern, Geschwister-Chips und dem Weg zu /wuerfe', async () => {
    await render()

    expect(container.querySelector('.eyebrow').textContent).toBe('Familienbande')
    expect(section().querySelector('h2').textContent).toBe('Nachwuchs')
    expect(section().querySelector('.offspring-item-title').textContent).toBe('Nachwuchs vom 18. April 2021 · von Frieda × Anton')
    // Die Chips zeigen vorn Avatar-Initialen, dahinter den Namen.
    expect([...section().querySelectorAll('.chip')].map((chip) => [chip.lastChild.textContent, chip.getAttribute('href')])).toEqual([
      ['Moritz', '/tier/4'],
      ['Paula', '/tier/3']
    ])
    const link = section().querySelector('a[href="/wuerfe"]')
    expect(link.textContent).toContain('Nachwuchs ansehen')
  })

  test('ohne Geschwister und ohne Verpaarungen: kein Abschnitt', async () => {
    await render({ dogs: parents })

    expect(api.listBreedingEvents).toHaveBeenCalled()
    expect(container.querySelector('[data-testid="pedigree-tree"]')).not.toBeNull()
    expect(section()).toBeNull()
  })

  test('nur eine erwartete Verpaarung: Abschnitt mit "Erwartet"', async () => {
    await render({ dogs: parents, events: [plannedEvent] })

    expect(section().textContent).toContain('Erwartet um den')
    expect(section().textContent).toContain('Frieda × Anton')
    expect(section().querySelector('.offspring-list')).toBeNull()
  })

  test('nur ältere Verpaarungen ohne Geschwister: Anzahl als Hinweis', async () => {
    const old = { ...plannedEvent, id: 8, datum: '2018-01-10' }
    await render({ dogs: parents, events: [old, { ...old, id: 9, datum: '2019-02-01' }] })

    expect(section().textContent).toContain('2 Verpaarungen eingetragen.')
  })

  test('schlägt das Laden der Verpaarungen fehl, bleibt die Seite stehen - nur ohne Abschnitt', async () => {
    await render({ dogs: parents, events: new Error('Fehler 500') })

    expect(container.querySelector('h1').textContent).toBe('Familie Sonnenhang')
    expect(section()).toBeNull()
  })

  test('kein Wort "Stammbaum", "Würfe" oder "Deckakt" auf der Seite', async () => {
    await render({ events: [plannedEvent] })

    expect(container.textContent).not.toMatch(/Stammbaum|Würfe|Wurf|Deckakt|Zucht/)
  })
})

describe('Stammbaum im Berner-Auftritt – unverändert', () => {
  test('Eyebrow "Stammbaum", kein Abschnitt (Würfe haben dort einen eigenen Reiter), keine Anfrage danach', async () => {
    await render({ themeId: 'berner', events: [plannedEvent] })

    expect(container.querySelector('.eyebrow').textContent).toBe('Stammbaum')
    expect(section()).toBeNull()
    expect(api.listBreedingEvents).not.toHaveBeenCalled()
  })

  test('leer: "Euer Stammbaum ist noch leer" bzw. im Standard "Eure Familienbande ist noch leer"', async () => {
    await render({ themeId: 'berner', dogs: [] })
    expect(container.querySelector('.empty-state h3').textContent).toBe('Euer Stammbaum ist noch leer')

    act(() => root.unmount())
    root = null
    container.remove()

    await render({ dogs: [] })
    expect(container.querySelector('.empty-state h3').textContent).toBe('Eure Familienbande ist noch leer')
  })
})
