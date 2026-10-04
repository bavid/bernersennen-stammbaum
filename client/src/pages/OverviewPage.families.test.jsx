// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({
  listDogs: vi.fn(),
  listAllDogs: vi.fn(),
  recentActivity: vi.fn(),
  listNotes: vi.fn(),
  listLinks: vi.fn(),
  listBreedingEvents: vi.fn(),
  visits: vi.fn(),
  erlebtMitTiere: vi.fn()
}))
vi.mock('../api', () => ({ api }))
// Der Baum braucht Layout-APIs (ResizeObserver), die jsdom nicht hat - hier geht es nur darum, WANN er erscheint.
vi.mock('../components/PedigreeTree.jsx', () => ({ default: () => <div data-testid="pedigree-tree" /> }))

import OverviewPage from './OverviewPage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
let location

const dog = (id, name, extra = {}) => ({ id, name, geschlecht: 'huendin', tierart: 'hund', geburtsdatum: '2019-03-10', ...extra })

// OverviewPage steht seit Phase W nur noch im Tierheim (/stammbaum, /familienbande - AreaRoutes ShelterRoutes); den Filter
// je Eigentümer prüft components/families/FamiliesView.test.jsx.
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
const shelterDogs = [
  dog(11, 'Nele', { family_id: 30, can_edit: 1, timeline_count: 4 }),
  dog(12, 'Mira', { family_id: 30, tierart: 'katze', can_edit: 1, timeline_count: 3 }),
  dog(13, 'Balu', { family_id: 30, geschlecht: 'ruede', can_edit: 1, timeline_count: 5 })
]
const mating = { id: 5, mutter_dog_id: 11, mutter_name: 'Nele', vater_dog_id: null, vater_freitext: 'Bodo', datum: '2018-01-10', foto_urls: [] }

function Probe() {
  location = useLocation()
  return null
}

beforeEach(() => {
  api.listAllDogs.mockResolvedValue([])
  api.recentActivity.mockResolvedValue([])
  api.listNotes.mockResolvedValue([])
  api.listLinks.mockResolvedValue([{ dog_a_id: 11, dog_b_id: 12 }])
  api.visits.mockResolvedValue({ besuche: [], gaeste: [] })
  api.erlebtMitTiere.mockResolvedValue([])
})

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  location = null
  for (const mock of Object.values(api)) mock.mockReset()
  delete document.documentElement.dataset.theme
  document.title = ''
})

async function render({ family = shelter, dogs = shelterDogs, events = [], path = '/familienbande', themeId = 'standard', onFamilyChange = () => {} } = {}) {
  api.listDogs.mockResolvedValue(dogs)
  // events als Promise: die Anfrage bleibt offen, bis der Test sie auflöst
  if (events instanceof Promise) api.listBreedingEvents.mockReturnValue(events)
  else api.listBreedingEvents.mockResolvedValue(events)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <ThemeProvider themeId={themeId}>
          <Probe />
          <Routes>
            <Route path="/familienbande" element={<OverviewPage family={{ ...family, theme: themeId }} onFamilyChange={onFamilyChange} onInvite={() => {}} />} />
            <Route path="*" element={<p data-testid="elsewhere" />} />
          </Routes>
        </ThemeProvider>
      </MemoryRouter>
    )
  )
  return container
}

const gridNames = () => [...container.querySelectorAll('.families-grid .dog-card-name')].map((n) => n.textContent)
const filter = () => container.querySelector('[role="group"][aria-label="Tiere filtern"]')
const heroLink = (text) => [...container.querySelectorAll('.hero-actions a')].find((a) => a.textContent.includes(text))
const heroButton = (text) => [...container.querySelectorAll('.hero-actions button')].find((b) => b.textContent.includes(text))
const statLabels = () => [...container.querySelectorAll('.stats dt')].map((dt) => dt.textContent)
const stat = (label) => [...container.querySelectorAll('.stats > div')].find((d) => d.querySelector('dt').textContent === label)
const tree = () => container.querySelector('[data-testid="pedigree-tree"]')

async function click(element) {
  await act(async () => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })))
}

describe('Familienbande des Tierheims (Familienbande 2): ein Raster statt Abschnitten', () => {
  test('alle Tiere in einem Raster, ohne Filter (nur eine Gruppe), ohne Beziehungs-Chips', async () => {
    await render()

    expect(tree()).toBeNull()
    expect(gridNames()).toEqual(['Nele', 'Mira', 'Balu'])
    expect(filter()).toBeNull()
    // Keine Abschnitts-Karten und keine Chips "lebt mit …" / "Mutter von …" mehr
    expect(container.querySelector('.family-group')).toBeNull()
    expect(container.querySelector('.relation-chips')).toBeNull()
    expect(container.querySelector('.families-view').textContent).not.toMatch(/lebt mit|Mutter von|Kind von|Geschwister von/)
    // Die Karten bleiben Links zur Tierseite
    expect(container.querySelector('.families-grid a').getAttribute('href')).toBe('/tier/11')
  })

  test('Kennzahlen: Tiere und Erinnerungen - weder Familien noch Zuhause; keine Zeile zu Familien und Freunden', async () => {
    await render()
    expect(statLabels()).toEqual(['Tiere', 'Erinnerungen'])
    expect(stat('Tiere').querySelector('dd').textContent).toBe('3')
    expect(stat('Erinnerungen').querySelector('dd').textContent).toBe('12')
    expect(container.querySelector('.page-hero').textContent).not.toMatch(/Hunde|weitere Tiere|Generation/)
    expect(container.querySelector('.families-links')).toBeNull()
    expect(container.querySelector('.hero-hint')).toBeNull()
    expect(api.visits).not.toHaveBeenCalled()
    expect(api.erlebtMitTiere).not.toHaveBeenCalled()
  })

  test('kein Nachwuchs und kein "Verpaarung eintragen" in der Familien-Ansicht - auch nicht mit Geschwistern', async () => {
    const dogs = [
      dog(1, 'Frieda', { can_edit: 1 }),
      dog(2, 'Anton', { geschlecht: 'ruede', can_edit: 1 }),
      dog(3, 'Paula', { mother_dog_id: 1, father_dog_id: 2, geburtsdatum: '2021-04-18' }),
      dog(4, 'Moritz', { geschlecht: 'ruede', mother_dog_id: 1, father_dog_id: 2, geburtsdatum: '2021-04-18' })
    ]
    await render({ dogs, events: [mating] })
    expect(container.querySelector('.offspring-section')).toBeNull()
    expect(container.querySelector('.offspring-hint')).toBeNull()
    expect(container.textContent).not.toMatch(/Verpaarung eintragen|Nachwuchs geplant|Sobald ihr eine Verpaarung/)

    act(() => root.unmount())
    container.remove()
    await render()
    expect(container.textContent).not.toMatch(/Verpaarung eintragen|Nachwuchs geplant|Sobald ihr eine Verpaarung/)
  })

  test('ohne Verpaarung und Eltern: kein Weg zum Stammbaum im Kopf', async () => {
    await render()
    expect(heroLink('Stammbaum')).toBeUndefined()
  })

  test('mit Verpaarung: "Stammbaum & Nachwuchs" führt zum Baum mit dem Nachwuchs darunter, "Zurück zu den Familien" zurück', async () => {
    await render({ events: [mating] })

    const open = heroLink('Stammbaum & Nachwuchs')
    expect(open.getAttribute('href')).toBe('/familienbande?ansicht=stammbaum')
    expect(container.querySelector('.feed')).not.toBeNull()
    await click(open)

    expect(location.search).toBe('?ansicht=stammbaum')
    expect(tree()).not.toBeNull()
    expect(container.querySelector('.families-view')).toBeNull()
    // Der Baum ist eine Ansicht für sich - die Neuigkeiten stehen bei den Familien
    expect(container.querySelector('.feed')).toBeNull()
    // Der Nachwuchs steht unter dem Baum - aus denselben Verpaarungen, ohne zweite Anfrage
    expect(container.querySelector('.offspring-section h2').textContent).toBe('Nachwuchs')
    expect(api.listBreedingEvents).toHaveBeenCalledTimes(1)
    const back = heroLink('Zurück zu den Familien')
    expect(back.getAttribute('href')).toBe('/familienbande')
    await click(back)

    expect(location.search).toBe('')
    expect(tree()).toBeNull()
    expect(container.querySelector('.families-view')).not.toBeNull()
  })

  test('Kopf: "Tier hinzufügen" vorn, "Jemanden einladen" daneben, "Stammbaum & Nachwuchs" als leiser Link dahinter', async () => {
    await render({ events: [mating] })
    const actions = [...container.querySelector('.hero-actions').children].map((el) => el.textContent.trim())
    expect(actions).toEqual(['Tier hinzufügen', 'Jemanden einladen', 'Stammbaum & Nachwuchs'])
    expect(heroButton('Tier hinzufügen').className).toContain('btn-primary')
    expect(heroLink('Stammbaum & Nachwuchs').className).not.toContain('btn')
  })

  test('auch Geschwister mit Eltern nur als Freitext (ohne Verpaarung, ohne Eltern in den Daten) öffnen "Stammbaum & Nachwuchs"', async () => {
    const dogs = [
      dog(1, 'Flocke', { mother_freitext: 'Lotte vom Deich', geburtsdatum: '2021-04-18' }),
      dog(2, 'Pepper', { geschlecht: 'ruede', mother_freitext: 'Lotte vom Deich', geburtsdatum: '2021-04-18' })
    ]
    await render({ dogs })
    await click(heroLink('Stammbaum & Nachwuchs'))
    expect(tree()).not.toBeNull()
    expect(container.querySelector('.offspring-section .chip-list').textContent).toContain('Pepper')
  })

  test('mit bekannten Eltern (ohne Verpaarung) gibt es den Stammbaum ebenfalls', async () => {
    const dogs = [dog(1, 'Bella'), dog(2, 'Cora', { mother_dog_id: 1, geburtsdatum: '2021-04-18' })]
    await render({ dogs, path: '/familienbande?ansicht=stammbaum' })
    expect(tree()).not.toBeNull()
    expect(heroLink('Zurück zu den Familien')).not.toBeUndefined()
  })

  test('ein Stammbaum-Link ohne Stammbaum zeigt einfach die Familien', async () => {
    await render({ path: '/familienbande?ansicht=stammbaum' })
    expect(tree()).toBeNull()
    expect(container.querySelector('.families-view')).not.toBeNull()
  })

  test('ein Stammbaum-Link wartet auf die Verpaarungen, dann erscheint der Baum', async () => {
    let resolveEvents
    const pending = new Promise((resolve) => {
      resolveEvents = resolve
    })
    await render({ events: pending, path: '/familienbande?ansicht=stammbaum' })
    expect(tree()).toBeNull()
    expect(container.querySelector('.families-view')).toBeNull()

    await act(async () => resolveEvents([mating]))
    expect(tree()).not.toBeNull()
  })
})
