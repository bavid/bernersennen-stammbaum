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
  erlebtMitTiere: vi.fn(),
  view: vi.fn()
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

const homeArea = {
  id: 1,
  name: 'Zuhause am Deich',
  theme: 'standard',
  art: 'zuhause',
  role: 'leitung',
  isDemo: false,
  home: { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause' },
  memberships: [{ id: 7, name: 'Familie Sonnenhang', theme: 'standard', rolle: 'leitung' }],
  besuche: [{ id: 4, name: 'Zuhause Möwenweg' }]
}
const homeDogs = [
  dog(11, 'Nele', { family_id: 1, shares: [7], can_edit: 1 }),
  dog(12, 'Mira', { family_id: 1, tierart: 'katze', shares: [7], can_edit: 1 }),
  dog(13, 'Balu', { family_id: 1, geschlecht: 'ruede', shares: [], can_edit: 1 })
]
const visitLists = { besuche: [{ id: 4, name: 'Zuhause Möwenweg', seit: '2026-08-01' }], gaeste: [{ id: 4, name: 'Zuhause Möwenweg', seit: '2026-08-03' }] }
const taggable = [{ id: 21, name: 'Wilma', nameUnbekannt: false, tierart: 'hund', zuhauseId: 4, zuhause: 'Zuhause Möwenweg' }]
const mating = { id: 5, mutter_dog_id: 11, mutter_name: 'Nele', vater_dog_id: null, vater_freitext: 'Bodo', datum: '2018-01-10', foto_urls: [] }

function LocationProbe() {
  location = useLocation()
  return null
}

beforeEach(() => {
  api.listAllDogs.mockResolvedValue([])
  api.recentActivity.mockResolvedValue([])
  api.listNotes.mockResolvedValue([])
  api.listLinks.mockResolvedValue([{ dog_a_id: 11, dog_b_id: 12 }])
  api.visits.mockResolvedValue(visitLists)
  api.erlebtMitTiere.mockResolvedValue(taggable)
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

async function render({ family = homeArea, dogs = homeDogs, events = [], path = '/familienbande', themeId = 'standard', onFamilyChange = () => {} } = {}) {
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
          <LocationProbe />
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

const sectionTitles = () => [...container.querySelectorAll('.family-group h2')].map((h2) => h2.textContent)
const sectionByTitle = (title) => [...container.querySelectorAll('.family-group')].find((s) => s.querySelector('h2').textContent === title)
const heroLink = (text) => [...container.querySelectorAll('.hero-actions a')].find((a) => a.textContent.includes(text))
const stat = (label) => [...container.querySelectorAll('.stats > div')].find((d) => d.querySelector('dt').textContent === label)
const tree = () => container.querySelector('[data-testid="pedigree-tree"]')

async function click(element) {
  await act(async () => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })))
}

describe('Familienbande im Standard-Auftritt (Phase V3): zuerst Familien', () => {
  test('eigenes Zuhause: Zuhause, die Familie mit den dort gezeigten Tieren, befreundete Zuhause - kein Baum', async () => {
    await render()

    expect(tree()).toBeNull()
    expect(sectionTitles()).toEqual(['Zuhause', 'Familie Sonnenhang', 'Befreundete Zuhause'])
    const zuhause = sectionByTitle('Zuhause')
    expect([...zuhause.querySelectorAll('.dog-card-name')].map((n) => n.textContent)).toEqual(['Nele', 'Mira', 'Balu'])
    expect(zuhause.querySelector('.family-group-meta').textContent).toBe('3 Tiere')
    // Beziehungen als Chips statt Linien
    const neleChips = zuhause.querySelector('[aria-label="Beziehungen von Nele"]')
    expect(neleChips.textContent).toBe('lebt mit Mira')

    const familie = sectionByTitle('Familie Sonnenhang')
    expect([...familie.querySelectorAll('.chip')].map((chip) => [chip.lastChild.textContent, chip.getAttribute('href')])).toEqual([
      ['Nele', '/tier/11'],
      ['Mira', '/tier/12']
    ])
    expect(familie.querySelector('.family-group-meta').textContent).toBe('Eure Rolle: Familienleitung')

    const freunde = sectionByTitle('Befreundete Zuhause')
    expect(freunde.querySelector('h3').textContent).toBe('Zuhause Möwenweg')
    // Nur Namen aus der "Erlebt mit"-Liste - keine Tierseite (kein Link), kein Foto
    expect(freunde.querySelector('.chip').textContent).toContain('Wilma')
    expect(freunde.querySelector('a')).toBeNull()
    expect(freunde.querySelector('img')).toBeNull()
  })

  test('Kennzahl "Familie" statt "Generationen": nur die Familien des Zuhauses, nicht Zuhause und Freunde (Audit V7a)', async () => {
    await render()
    expect(stat('Familien')).toBeUndefined()
    expect(stat('Familie').querySelector('dd').textContent).toBe('1')
    expect(stat('Generationen')).toBeUndefined()
    expect(container.querySelector('.page-hero').textContent).not.toMatch(/Generation/)
  })

  test('ohne Verpaarung und Eltern: kein "Stammbaum öffnen", dafür der leise Hinweis - in EINER Zeile mit "Nachwuchs geplant?"', async () => {
    await render()
    expect(heroLink('Stammbaum')).toBeUndefined()
    // Audit V7a: vorher zwei Zeilen fast gleichen Inhalts untereinander
    expect(container.querySelector('.families-tree-hint')).toBeNull()
    const hint = container.querySelector('.offspring-hint')
    expect(hint.textContent).toContain('Nachwuchs geplant? Mit der ersten Verpaarung entsteht hier euer Stammbaum.')
    expect(hint.querySelector('a').getAttribute('href')).toBe('/wuerfe')
  })

  test('ohne eigene Hündin (keine leise Zeile zur Verpaarung) steht der Stammbaum-Hinweis allein', async () => {
    await render({ dogs: [dog(31, 'Kater Karlo', { tierart: 'katze', geschlecht: 'ruede' })] })
    expect(container.querySelector('.offspring-hint')).toBeNull()
    expect(container.querySelector('.families-tree-hint').textContent).toBe('Sobald ihr eine Verpaarung eintragt, entsteht hier euer Stammbaum.')
  })

  test('der Hinweis nur für Rollen, die eine Verpaarung eintragen dürfen', async () => {
    const group = { ...homeArea, id: 7, name: 'Familie Sonnenhang', art: 'rudel', role: 'gast' }
    await render({ family: group, dogs: [dog(31, 'Bella', { family_id: 7 })] })
    expect(container.querySelector('.families-tree-hint')).toBeNull()
  })

  test('mit Verpaarung: "Stammbaum öffnen" führt zum Baum, "Zurück zu den Familien" wieder zurück', async () => {
    await render({ events: [mating] })

    expect(container.querySelector('.families-tree-hint')).toBeNull()
    const open = heroLink('Stammbaum öffnen')
    expect(open.getAttribute('href')).toBe('/familienbande?ansicht=stammbaum')
    await click(open)

    expect(location.search).toBe('?ansicht=stammbaum')
    expect(tree()).not.toBeNull()
    expect(container.querySelector('.families-view')).toBeNull()
    const back = heroLink('Zurück zu den Familien')
    expect(back.getAttribute('href')).toBe('/familienbande')
    await click(back)

    expect(location.search).toBe('')
    expect(tree()).toBeNull()
    expect(container.querySelector('.families-view')).not.toBeNull()
  })

  test('mit bekannten Eltern (ohne Verpaarung) gibt es den Stammbaum ebenfalls; im Baum heißt es weiter "Generation"', async () => {
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

  test('"Familie öffnen" wechselt in die Familie (POST /api/view) und meldet das neue "me"', async () => {
    const onFamilyChange = vi.fn()
    const me = { ...homeArea, id: 7, name: 'Familie Sonnenhang', art: 'rudel' }
    api.view.mockResolvedValue(me)
    await render({ onFamilyChange })

    const button = sectionByTitle('Familie Sonnenhang').querySelector('button')
    // Sichtbarer Text vorn, der Name der Familie für Screenreader dahinter (kein abweichendes aria-label)
    expect(button.getAttribute('aria-label')).toBeNull()
    expect(button.textContent.trim()).toBe('Familie öffnen: Familie Sonnenhang')
    await click(button)

    expect(api.view).toHaveBeenCalledWith(7)
    expect(onFamilyChange).toHaveBeenCalledWith(me)
    expect(location.pathname).toBe('/stammbaum')
  })

  test('schlägt der Wechsel fehl, bleibt man auf der Seite', async () => {
    const onFamilyChange = vi.fn()
    api.view.mockRejectedValue(new Error('Diesen Bereich gibt es nicht'))
    await render({ onFamilyChange })
    await click(sectionByTitle('Familie Sonnenhang').querySelector('button'))
    expect(onFamilyChange).not.toHaveBeenCalled()
    expect(location.pathname).toBe('/familienbande')
  })

  test('"Besuchen" wechselt zu Besuch ins befreundete Zuhause', async () => {
    const onFamilyChange = vi.fn()
    const me = { ...homeArea, id: 4, name: 'Zuhause Möwenweg', zuBesuch: true, role: 'gast' }
    api.view.mockResolvedValue(me)
    await render({ onFamilyChange })
    const button = sectionByTitle('Befreundete Zuhause').querySelector('button')
    expect(button.getAttribute('aria-label')).toBe('Zuhause Möwenweg besuchen')
    await click(button)
    expect(api.view).toHaveBeenCalledWith(4)
    expect(onFamilyChange).toHaveBeenCalledWith(me)
    expect(location.pathname).toBe('/wegbegleiter')
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

  test('"Besuchen" nur bei Zuhause, die man besuchen darf', async () => {
    api.visits.mockResolvedValue({ besuche: [], gaeste: [{ id: 6, name: 'Zuhause Birkenhain', seit: '2026-09-01' }] })
    await render()
    const freunde = sectionByTitle('Befreundete Zuhause')
    expect(freunde.querySelector('button')).toBeNull()
    expect(freunde.textContent).toContain('Noch keine Tiere eingetragen.')
  })

  test('schlagen die Besuchs-Listen fehl, fehlt nur der Abschnitt', async () => {
    api.visits.mockRejectedValue(new Error('Fehler 500'))
    await render()
    expect(sectionTitles()).toEqual(['Zuhause', 'Familie Sonnenhang'])
  })

  test('in einer Familie: zuerst die Familie selbst, dann die Zuhause der Mitglieder; keine Besuchs-Anfragen', async () => {
    const group = { ...homeArea, id: 7, name: 'Familie Sonnenhang', art: 'rudel', role: 'leitung' }
    const dogs = [
      dog(31, 'Bella', { family_id: 7 }),
      dog(32, 'Cora', { family_id: 7, mother_dog_id: 31, geburtsdatum: '2021-04-18' }),
      dog(11, 'Nele', { family_id: 1, shared_from: 'Zuhause am Deich' }),
      dog(21, 'Wilma', { family_id: 4, shared_from: 'Zuhause Möwenweg' })
    ]
    await render({ family: group, dogs })

    expect(sectionTitles()).toEqual(['Familie Sonnenhang', 'Zuhause am Deich', 'Zuhause Möwenweg'])
    expect(sectionByTitle('Familie Sonnenhang').textContent).toContain('Mutter von Cora')
    // Unter "Zuhause am Deich" kein doppeltes "aus Zuhause am Deich" an der Karte
    expect(sectionByTitle('Zuhause am Deich').textContent).not.toContain('aus Zuhause am Deich')
    expect(api.visits).not.toHaveBeenCalled()
    expect(api.erlebtMitTiere).not.toHaveBeenCalled()
    expect(heroLink('Stammbaum öffnen')).not.toBeUndefined()
  })

  test('zu Besuch: nur das besuchte Zuhause, keine Familien oder Besuche des Gasts', async () => {
    const visit = { ...homeArea, id: 4, name: 'Zuhause Möwenweg', zuBesuch: true, role: 'gast' }
    await render({ family: visit, dogs: [dog(21, 'Wilma', { family_id: 4, shares: [] })] })
    expect(sectionTitles()).toEqual(['Zuhause'])
    expect(api.visits).not.toHaveBeenCalled()
    expect(container.querySelector('.families-tree-hint')).toBeNull()
  })
})

describe('Berner-Auftritt (Phase V3): unverändert der Stammbaum', () => {
  test('Baum direkt, kein Umschalter, Kennzahl "Generationen", keine Anfragen für Familien-Ansicht', async () => {
    await render({ themeId: 'berner', events: [mating] })

    expect(tree()).not.toBeNull()
    expect(container.querySelector('.families-view')).toBeNull()
    expect(heroLink('Stammbaum öffnen')).toBeUndefined()
    expect(heroLink('Zurück zu den Familien')).toBeUndefined()
    expect(stat('Generationen') || stat('Generation')).not.toBeUndefined()
    expect(stat('Familien')).toBeUndefined()
    expect(api.listBreedingEvents).not.toHaveBeenCalled()
    expect(api.visits).not.toHaveBeenCalled()
  })

  test('auch ein Stammbaum-Link bleibt beim Baum', async () => {
    await render({ themeId: 'berner', path: '/familienbande?ansicht=stammbaum' })
    expect(tree()).not.toBeNull()
    expect(container.querySelector('.families-tree-hint')).toBeNull()
  })
})
