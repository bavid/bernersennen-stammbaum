// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
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
let navigate

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
  dog(11, 'Nele', { family_id: 1, shares: [7], can_edit: 1, timeline_count: 4 }),
  dog(12, 'Mira', { family_id: 1, tierart: 'katze', shares: [7], can_edit: 1, timeline_count: 3 }),
  dog(13, 'Balu', { family_id: 1, geschlecht: 'ruede', shares: [], can_edit: 1, timeline_count: 5 })
]
const visitLists = { besuche: [{ id: 4, name: 'Zuhause Möwenweg', seit: '2026-08-01' }], gaeste: [{ id: 4, name: 'Zuhause Möwenweg', seit: '2026-08-03' }] }
const mating = { id: 5, mutter_dog_id: 11, mutter_name: 'Nele', vater_dog_id: null, vater_freitext: 'Bodo', datum: '2018-01-10', foto_urls: [] }

// Familie Sonnenhang: eigene Tiere (Cora und Dante mit gleichen Eltern, Dantes Vater unbekannt), dazu aus zwei Zuhause
// geteilte Tiere.
const group = { ...homeArea, id: 7, name: 'Familie Sonnenhang', art: 'rudel', role: 'leitung' }
const groupDogs = [
  dog(31, 'Bella', { family_id: 7, timeline_count: 2 }),
  dog(32, 'Cora', { family_id: 7, mother_dog_id: 31, father_dog_id: 33, geburtsdatum: '2021-04-18' }),
  dog(33, 'Unbekannt', { family_id: 7, geschlecht: 'ruede', name_unbekannt: 1 }),
  dog(34, 'Dante', { family_id: 7, geschlecht: 'ruede', mother_dog_id: 31, father_dog_id: 33, geburtsdatum: '2021-04-18' }),
  dog(11, 'Nele', { family_id: 1, shared_from: 'Zuhause am Deich', timeline_count: 4 }),
  dog(12, 'Mira', { family_id: 1, tierart: 'katze', shared_from: 'Zuhause am Deich' }),
  dog(21, 'Wilma', { family_id: 4, shared_from: 'Zuhause Möwenweg (Demo)' })
]

function Probe() {
  location = useLocation()
  navigate = useNavigate()
  return null
}

beforeEach(() => {
  api.listAllDogs.mockResolvedValue([])
  api.recentActivity.mockResolvedValue([])
  api.listNotes.mockResolvedValue([])
  api.listLinks.mockResolvedValue([{ dog_a_id: 11, dog_b_id: 12 }])
  api.visits.mockResolvedValue(visitLists)
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
  navigate = null
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
const filterButtons = () => [...(filter()?.querySelectorAll('button') || [])]
const filterButton = (text) => filterButtons().find((button) => button.textContent.startsWith(text))
const heroLink = (text) => [...container.querySelectorAll('.hero-actions a')].find((a) => a.textContent.includes(text))
const heroButton = (text) => [...container.querySelectorAll('.hero-actions button')].find((b) => b.textContent.includes(text))
const statLabels = () => [...container.querySelectorAll('.stats dt')].map((dt) => dt.textContent)
const stat = (label) => [...container.querySelectorAll('.stats > div')].find((d) => d.querySelector('dt').textContent === label)
const areaLine = () => container.querySelector('.families-links')
// Was man sieht - ohne die Zusätze nur für Screenreader (.visually-hidden)
function visibleText(element) {
  const copy = element.cloneNode(true)
  for (const hidden of copy.querySelectorAll('.visually-hidden')) hidden.remove()
  return copy.textContent
}
const areaButton = (text) => [...(areaLine()?.querySelectorAll('button') || [])].find((b) => b.textContent.startsWith(text))
const tree = () => container.querySelector('[data-testid="pedigree-tree"]')

async function click(element) {
  await act(async () => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })))
}

describe('Familienbande im Standard-Auftritt (Familienbande 2): ein Raster statt Abschnitten', () => {
  test('eigenes Zuhause: alle Tiere in einem Raster, ohne Filter (nur eine Gruppe), ohne Beziehungs-Chips', async () => {
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

  test('Kennzahlen im Standard: höchstens drei - Tiere, Familie(n) des Zuhauses, Erinnerungen', async () => {
    await render()
    expect(statLabels()).toEqual(['Tiere', 'Familie', 'Erinnerungen'])
    expect(stat('Tiere').querySelector('dd').textContent).toBe('3')
    expect(stat('Familie').querySelector('dd').textContent).toBe('1')
    expect(stat('Erinnerungen').querySelector('dd').textContent).toBe('12')
    expect(container.querySelector('.page-hero').textContent).not.toMatch(/Hunde|weitere Tiere|Generation/)
  })

  test('statt Karten für Familie und Freunde eine leise Zeile mit Links', async () => {
    await render()
    expect(visibleText(areaLine())).toBe('Ihr zeigt Tiere auch in Familie Sonnenhang · befreundet mit Zuhause Möwenweg')
    expect(container.textContent).not.toContain('Befreundete Zuhause')
    expect(container.textContent).not.toContain('Hier zeigt ihr')
    expect(container.textContent).not.toContain('Familie öffnen')
    // Sichtbarer Name vorn, was der Link tut, für Screenreader dahinter
    expect(areaButton('Familie Sonnenhang').textContent).toBe('Familie Sonnenhang öffnen')
    expect(areaButton('Zuhause Möwenweg').textContent).toBe('Zuhause Möwenweg besuchen')
  })

  // Phase W: die Zeile navigiert nur zur Gruppenseite - den Wechsel (POST /api/view) macht dort das AreaGate.
  test('ein Klick auf die Familie in der Zeile führt zu ihrer Gruppenseite', async () => {
    const onFamilyChange = vi.fn()
    await render({ onFamilyChange })

    await click(areaButton('Familie Sonnenhang'))

    expect(location.pathname).toBe('/familien/7')
    expect(api.view).not.toHaveBeenCalled()
    expect(onFamilyChange).not.toHaveBeenCalled()
  })

  test('ein Klick auf das befreundete Zuhause führt zu dessen Gruppenseite', async () => {
    await render({ onFamilyChange: vi.fn() })
    await click(areaButton('Zuhause Möwenweg'))
    expect(location.pathname).toBe('/familien/4')
    expect(api.view).not.toHaveBeenCalled()
  })

  test('Zuhause, die nur bei euch zu Gast sind, stehen ohne Link da; Familien ohne geteilte Tiere als "Mitglied in"', async () => {
    api.visits.mockResolvedValue({ besuche: [], gaeste: [{ id: 6, name: 'Zuhause Birkenhain', seit: '2026-09-01' }] })
    const family = { ...homeArea, memberships: [...homeArea.memberships, { id: 9, name: 'Familie Lindenweg', theme: 'standard', rolle: 'gast' }] }
    await render({ family })
    expect(visibleText(areaLine())).toBe('Ihr zeigt Tiere auch in Familie Sonnenhang · Mitglied in Familie Lindenweg · befreundet mit Zuhause Birkenhain')
    expect(areaButton('Zuhause Birkenhain')).toBeUndefined()
    expect(areaButton('Familie Lindenweg')).not.toBeUndefined()
  })

  test('schlagen die Besuchs-Listen fehl, fehlt nur dieser Teil; ohne Familien und Freunde keine Zeile', async () => {
    api.visits.mockRejectedValue(new Error('Fehler 500'))
    await render()
    expect(visibleText(areaLine())).toBe('Ihr zeigt Tiere auch in Familie Sonnenhang')

    act(() => root.unmount())
    container.remove()
    api.visits.mockResolvedValue({ besuche: [], gaeste: [] })
    await render({ family: { ...homeArea, memberships: [] } })
    expect(areaLine()).toBeNull()
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
    await render({ dogs, family: { ...homeArea, memberships: [] } })
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

describe('Familienbande in einer Familie: Filter je Zuhause', () => {
  test('ein Raster mit allen Tieren; unbekannte Eltern stehen nicht darin; Filter mit Anzahl, "Alle" gewählt', async () => {
    await render({ family: group, dogs: groupDogs })

    expect(gridNames()).toEqual(['Bella', 'Cora', 'Dante', 'Nele', 'Mira', 'Wilma'])
    expect(container.querySelector('.families-view').textContent).not.toContain('Unbekannt')
    expect(filterButtons().map((button) => button.textContent)).toEqual(['Alle 6', 'Familie 3', 'Zuhause am Deich 2', 'Möwenweg 1'])
    expect(filterButtons().map((button) => button.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false'])
    // Der volle Name steht im Tooltip (für Screenreader die Beschreibung); der Name des Knopfs bleibt, was man sieht
    expect(filterButton('Möwenweg').getAttribute('title')).toBe('Zuhause Möwenweg (Demo)')
    expect(filterButton('Familie').getAttribute('title')).toBe('Familie Sonnenhang')
    expect(filterButton('Alle').getAttribute('title')).toBeNull()
    expect(filterButton('Möwenweg').getAttribute('aria-controls')).toBe(container.querySelector('.families-grid').id)
    // Unter "Alle" tragen geteilte Tiere eine leise Herkunft
    const nele = [...container.querySelectorAll('.families-grid .dog-card')].find((card) => card.textContent.includes('Nele'))
    expect(nele.querySelector('.dog-card-shared').textContent).toBe('aus Zuhause am Deich')
  })

  test('Kennzahlen in einer Familie: Tiere, Zuhause (die Tiere hierher teilen), Erinnerungen', async () => {
    await render({ family: group, dogs: groupDogs })
    expect(statLabels()).toEqual(['Tiere', 'Zuhause', 'Erinnerungen'])
    expect(stat('Tiere').querySelector('dd').textContent).toBe('6')
    expect(stat('Zuhause').querySelector('dd').textContent).toBe('2')
    expect(stat('Erinnerungen').querySelector('dd').textContent).toBe('6')
  })

  test('ein Filter zeigt nur die Tiere dieses Zuhauses, steht in der Adresse und lässt sich mit Zurück aufheben', async () => {
    await render({ family: group, dogs: groupDogs })

    await click(filterButton('Zuhause am Deich'))
    expect(location.search).toBe('?gruppe=1')
    expect(gridNames()).toEqual(['Nele', 'Mira'])
    expect(filterButton('Zuhause am Deich').getAttribute('aria-pressed')).toBe('true')
    expect(filterButton('Alle').getAttribute('aria-pressed')).toBe('false')
    // Unter dem gewählten Zuhause kein doppeltes "aus Zuhause am Deich"
    expect(container.querySelector('.families-grid').textContent).not.toContain('aus Zuhause am Deich')

    await click(filterButton('Familie'))
    expect(location.search).toBe('?gruppe=eigen')
    expect(gridNames()).toEqual(['Bella', 'Cora', 'Dante'])

    await act(async () => navigate(-1))
    expect(gridNames()).toEqual(['Nele', 'Mira'])
    await act(async () => navigate(-1))
    expect(location.search).toBe('')
    expect(gridNames()).toHaveLength(6)
  })

  test('ein Klick auf den schon gewählten Filter legt keinen zweiten Eintrag in den Verlauf', async () => {
    await render({ family: group, dogs: groupDogs })
    await click(filterButton('Möwenweg'))
    await click(filterButton('Möwenweg'))
    expect(location.search).toBe('?gruppe=4')
    await act(async () => navigate(-1))
    expect(location.search).toBe('')

    // "Alle" ohne Filter in der Adresse ändert nichts
    await click(filterButton('Alle'))
    expect(location.key).toBe('default')
  })

  test('"Alle" nimmt den Filter aus der Adresse; ein unbekannter Filter zeigt alle', async () => {
    await render({ family: group, dogs: groupDogs, path: '/familienbande?gruppe=4' })
    expect(gridNames()).toEqual(['Wilma'])
    await click(filterButton('Alle'))
    expect(location.search).toBe('')
    expect(gridNames()).toHaveLength(6)

    act(() => root.unmount())
    container.remove()
    await render({ family: group, dogs: groupDogs, path: '/familienbande?gruppe=99' })
    expect(gridNames()).toHaveLength(6)
    expect(filterButton('Alle').getAttribute('aria-pressed')).toBe('true')
    // "Alle" räumt auch einen veralteten Filter aus der Adresse
    await click(filterButton('Alle'))
    expect(location.search).toBe('')
  })

  test('keine Zeile mit Familien und Freunden, keine Besuchs-Anfragen; "Stammbaum & Nachwuchs" dank Eltern', async () => {
    await render({ family: group, dogs: groupDogs })
    expect(areaLine()).toBeNull()
    expect(api.visits).not.toHaveBeenCalled()
    expect(api.erlebtMitTiere).not.toHaveBeenCalled()
    expect(heroLink('Stammbaum & Nachwuchs')).not.toBeUndefined()
    expect(container.querySelector('.hero-hint a').getAttribute('href')).toBe('/mitglieder')
  })

  test('Gast in der Familie: dasselbe Raster mit Filter, ohne Knöpfe zum Schreiben', async () => {
    await render({ family: { ...group, role: 'gast' }, dogs: groupDogs })
    expect(gridNames()).toHaveLength(6)
    expect(filter()).not.toBeNull()
    expect(heroButton('Tier hinzufügen')).toBeUndefined()
    expect(heroButton('Jemanden einladen')).toBeUndefined()
  })
})

describe('Familienbande zu Besuch', () => {
  test('dasselbe Raster ohne Filter, ohne Schreib-Knöpfe und ohne Zeile; Kennzahlen ohne Familien', async () => {
    const visit = { ...homeArea, id: 4, name: 'Zuhause Möwenweg', zuBesuch: true, role: 'gast' }
    await render({ family: visit, dogs: [dog(21, 'Wilma', { family_id: 4, shares: [], can_edit: 0 })] })
    expect(gridNames()).toEqual(['Wilma'])
    expect(filter()).toBeNull()
    expect(areaLine()).toBeNull()
    expect(api.visits).not.toHaveBeenCalled()
    expect(heroButton('Tier hinzufügen')).toBeUndefined()
    expect(heroButton('Jemanden einladen')).toBeUndefined()
    expect(statLabels()).toEqual(['Tier', 'Erinnerungen'])
  })
})

describe('Berner-Auftritt (Phase V3): unverändert der Stammbaum', () => {
  test('Baum direkt, kein Umschalter, Kennzahlen Hunde und Generationen, keine Anfragen für die Familien-Ansicht', async () => {
    await render({ themeId: 'berner', events: [mating] })

    expect(tree()).not.toBeNull()
    expect(container.querySelector('.families-view')).toBeNull()
    expect(heroLink('Stammbaum')).toBeUndefined()
    expect(heroLink('Zurück zu den Familien')).toBeUndefined()
    expect(stat('Generationen') || stat('Generation')).not.toBeUndefined()
    expect(stat('Hunde')).not.toBeUndefined()
    expect(stat('Tiere')).toBeUndefined()
    expect(stat('Familien')).toBeUndefined()
    expect(container.querySelector('.offspring-section')).toBeNull()
    expect(api.listBreedingEvents).not.toHaveBeenCalled()
    expect(api.visits).not.toHaveBeenCalled()
    expect(container.querySelector('.page-hero').className).toBe('page-hero')
    // Kopf wie bisher: die beiden großen Knöpfe
    expect([...container.querySelector('.hero-actions').children].map((el) => el.className)).toEqual([
      'btn btn-primary btn-lg',
      'btn btn-ghost btn-lg'
    ])
  })

  test('auch ein Stammbaum-Link bleibt beim Baum; "Neu im Rudel" steht weiter darüber', async () => {
    api.recentActivity.mockResolvedValue([{ id: 1, dog_id: 11, dog_name: 'Nele', titel: 'Am Deich', datum: '2026-09-01', created_at: '2026-09-01 10:00:00', autor_name: 'Zuhause am Deich' }])
    await render({ themeId: 'berner', path: '/familienbande?ansicht=stammbaum' })
    expect(tree()).not.toBeNull()
    expect(container.querySelector('.feed-title').textContent).toBe('Neu im Rudel')
  })
})
