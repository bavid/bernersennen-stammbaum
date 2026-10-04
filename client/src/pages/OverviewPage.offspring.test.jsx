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

// Familienbande 2: im Standard-Auftritt steht der Nachwuchs beim Stammbaum (?ansicht=stammbaum), nicht bei den Familien.
const TREE_PATH = '/?ansicht=stammbaum'

async function render({ themeId = 'standard', dogs = [...parents, ...siblings], events = [], role = 'leitung', path = TREE_PATH } = {}) {
  api.listDogs.mockResolvedValue(dogs)
  if (events instanceof Error) api.listBreedingEvents.mockRejectedValue(events)
  else api.listBreedingEvents.mockResolvedValue(events)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <ThemeProvider themeId={themeId}>
          <OverviewPage family={{ ...family, theme: themeId, role }} onFamilyChange={() => {}} onInvite={() => {}} />
        </ThemeProvider>
      </MemoryRouter>
    )
  )
  return container
}

const section = () => container.querySelector('.offspring-section')

describe('Familienbande – "Nachwuchs" beim Stammbaum (Phase U, Familienbande 2, Standard-Auftritt)', () => {
  const tree = () => container.querySelector('[data-testid="pedigree-tree"]')

  test('mit Geschwistern: Abschnitt unter dem Baum mit Titel, Eltern, Geschwister-Chips und dem Weg zu /wuerfe', async () => {
    await render()

    expect(container.querySelector('.eyebrow').textContent).toBe('Familienbande')
    expect(tree()).not.toBeNull()
    expect(section().querySelector('h2').textContent).toBe('Nachwuchs')
    expect(section().querySelector('.offspring-item-title').textContent).toBe('Nachwuchs vom 18. April 2021 · von Frieda × Anton')
    // Die Chips zeigen vorn Avatar-Initialen, dahinter den Namen.
    expect([...section().querySelectorAll('.chip')].map((chip) => [chip.lastChild.textContent, chip.getAttribute('href')])).toEqual([
      ['Moritz', '/tier/4'],
      ['Paula', '/tier/3']
    ])
    const link = section().querySelector('a[href="/wuerfe"]')
    expect(link.textContent).toContain('Nachwuchs ansehen')
    // Erst der Baum, darunter der Nachwuchs
    expect(tree().compareDocumentPosition(section()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  test('bei den Familien steht kein Nachwuchs - auch mit Geschwistern nicht', async () => {
    await render({ path: '/' })
    expect(container.querySelector('.families-view')).not.toBeNull()
    expect(section()).toBeNull()
    expect(container.querySelector('.offspring-hint')).toBeNull()
  })

  test('wer eine Verpaarung eintragen darf, findet den Weg dazu im Abschnitt (öffnet das Formular direkt)', async () => {
    await render()
    const add = section().querySelector('a[href="/wuerfe?verpaarung=neu"]')
    expect(add.textContent).toContain('Verpaarung eintragen')

    act(() => root.unmount())
    root = null
    container.remove()

    await render({ role: 'gast' })
    expect(section().querySelector('a[href="/wuerfe?verpaarung=neu"]')).toBeNull()
  })

  test('Baum ohne Geschwister und ohne Verpaarungen: kein Abschnitt - nur eine leise Zeile zur ersten Verpaarung', async () => {
    await render({ dogs: [...parents, siblings[0]] })

    expect(api.listBreedingEvents).toHaveBeenCalled()
    expect(tree()).not.toBeNull()
    expect(section()).toBeNull()
    const hint = container.querySelector('.offspring-hint')
    expect(hint.textContent).toContain('Nachwuchs geplant?')
    expect(hint.querySelector('a').getAttribute('href')).toBe('/wuerfe?verpaarung=neu')
    expect(hint.querySelector('a').textContent).toContain('Verpaarung eintragen')
  })

  test('ohne Eltern und ohne Verpaarung gibt es keinen Baum - und damit auch keinen Nachwuchs-Hinweis', async () => {
    await render({ dogs: parents })
    expect(tree()).toBeNull()
    expect(container.querySelector('.families-view')).not.toBeNull()
    expect(container.querySelector('.offspring-hint')).toBeNull()
  })

  test('die leise Zeile nur mit Schreibrecht und eigener Hündin', async () => {
    await render({ dogs: [...parents, siblings[0]], role: 'gast' })
    expect(container.querySelector('.offspring-hint')).toBeNull()

    act(() => root.unmount())
    root = null
    container.remove()

    const cats = [
      dog(1, 'Minka', { tierart: 'katze' }),
      dog(2, 'Kater Karlo', { tierart: 'katze', geschlecht: 'ruede' }),
      dog(3, 'Mimi', { tierart: 'katze', mother_dog_id: 1, geburtsdatum: '2021-04-18' })
    ]
    await render({ dogs: cats })
    expect(tree()).not.toBeNull()
    expect(container.querySelector('.offspring-hint')).toBeNull()
    expect(section()).toBeNull()
  })

  test('mehr als drei Geschwistergruppen: drei stehen da, dazu "… und N weitere."', async () => {
    const groups = [2017, 2018, 2019, 2020, 2021].flatMap((year, index) => [
      dog(10 + index * 2, `Erstes ${year}`, { mother_dog_id: 1, father_dog_id: 2, geburtsdatum: `${year}-05-01` }),
      dog(11 + index * 2, `Zweites ${year}`, { mother_dog_id: 1, father_dog_id: 2, geburtsdatum: `${year}-05-01` })
    ])
    await render({ dogs: [...parents, ...groups] })

    expect(section().querySelectorAll('.offspring-item')).toHaveLength(3)
    expect(section().querySelector('.offspring-item-title').textContent).toContain('Nachwuchs vom 1. Mai 2021')
    expect(section().textContent).toContain('… und 2 weitere.')
  })

  test('Erwartetes und Geschwister zusammen; genau eine Verpaarung heißt "1 Verpaarung eingetragen."', async () => {
    await render({ events: [plannedEvent] })
    expect(section().querySelector('.offspring-planned').textContent).toContain('Erwartet um den')
    expect(section().querySelectorAll('.offspring-item')).toHaveLength(1)

    act(() => root.unmount())
    root = null
    container.remove()

    await render({ dogs: parents, events: [{ ...plannedEvent, datum: '2018-01-10' }] })
    expect(section().textContent).toContain('1 Verpaarung eingetragen.')
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
    await render({ dogs: [...parents, siblings[0]], events: new Error('Fehler 500') })

    expect(container.querySelector('h1').textContent).toBe('Familie Sonnenhang')
    expect(tree()).not.toBeNull()
    expect(section()).toBeNull()
  })

  // Phase V3: einzige Ausnahme ist der ausdrückliche Zusatz "Stammbaum & Nachwuchs" (erst mit Verpaarung oder Eltern).
  test('kein Wort "Stammbaum", "Würfe" oder "Deckakt" bei den Familien - außer dem Link "Stammbaum & Nachwuchs"', async () => {
    await render({ events: [plannedEvent], path: '/' })

    const toggle = [...container.querySelectorAll('.hero-actions a')].find((link) => link.textContent.includes('Stammbaum'))
    expect(toggle.textContent).toBe('Stammbaum & Nachwuchs')
    const rest = container.textContent.replace('Stammbaum & Nachwuchs', '')
    expect(rest).not.toMatch(/Stammbaum|Würfe|Wurf|Deckakt|Zucht/)
  })
})

