// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({
  listDogs: vi.fn(),
  sichtbarkeitUebersicht: vi.fn(),
  listTimeline: vi.fn(),
  visits: vi.fn(),
  rahmenGeraete: vi.fn(),
  setDogShares: vi.fn(),
  setShelterShare: vi.fn(),
  updateTimelineEntry: vi.fn(),
  removeGuest: vi.fn()
}))
vi.mock('../../api', () => ({ api }))
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock('../Toast.jsx', () => ({ useToast: () => toast }))

import SichtbarkeitSection from './SichtbarkeitSection.jsx'
import { DemoProvider } from '../../lib/demo.js'
import { ThemeProvider } from '../../themes/ThemeProvider.jsx'
import { setLang } from '../../lib/i18n/index.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const home = { id: 1, name: 'Zuhause am Deich', art: 'zuhause' }
const family = {
  ...home,
  isDemo: false,
  home,
  memberships: [
    { id: 3, name: 'Familie Sonnenhang', rolle: 'mitglied', tiere: 4, eigeneTiere: 1 },
    { id: 4, name: 'Familie Talgrund', rolle: 'mitglied', tiere: 2, eigeneTiere: 0 }
  ]
}
const dogs = [
  { id: 11, name: 'Benno', family_id: 1, can_edit: 1, shares: [3] },
  { id: 12, name: 'Wilma', family_id: 1, can_edit: 1, shares: [] },
  { id: 13, name: 'Lotte', family_id: 7, can_edit: 0, shares: [] }
]
const entries = [
  { id: 101, dog_id: 11, family_id: 1, autor_name: 'Pepper', datum: '2026-09-01', titel: 'Am See', text: 'Schön', foto_urls: ['/uploads/a.jpg'], privat: 1 },
  { id: 102, dog_id: 12, family_id: 1, autor_name: 'Pepper', datum: '2026-08-01', titel: 'Im Garten', text: '', foto_urls: [], privat: 0 },
  { id: 103, dog_id: 13, family_id: 7, autor_name: 'Flocke', datum: '2026-09-05', titel: 'Fremd', text: '', foto_urls: [], privat: 0 }
]

let container
let root
let location
let onFamilyChange

function Probe() {
  location = useLocation()
  return null
}

async function render(path = '/einstellungen?bereich=sichtbarkeit', me = family) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <ThemeProvider themeId="standard">
          <DemoProvider value={me}>
            <SichtbarkeitSection family={me} onFamilyChange={onFamilyChange} />
            <Probe />
          </DemoProvider>
        </ThemeProvider>
      </MemoryRouter>
    )
  )
  await act(async () => {})
}

const byText = (selector, text) => [...container.querySelectorAll(selector)].find((el) => el.textContent.trim() === text)
const card = (name) => [...container.querySelectorAll('.sicht-tier')].find((el) => el.querySelector('h3').textContent === name)
const switchIn = (el, label) =>
  [...el.querySelectorAll('.share-switch')].find((item) => item.querySelector('.share-switch-label').textContent === label).querySelector('input')

beforeEach(() => {
  setLang('de')
  onFamilyChange = vi.fn()
  api.listDogs.mockResolvedValue(dogs)
  api.sichtbarkeitUebersicht.mockResolvedValue({
    tiere: [
      { id: 11, privat: 1, geteilt: 4, tierheim: { name: 'Tierheim Flocke', liestMit: true } },
      { id: 12, privat: 0, geteilt: 1, tierheim: null }
    ]
  })
  api.listTimeline.mockResolvedValue(entries)
  api.visits.mockResolvedValue({ besuche: [], gaeste: [{ id: 9, name: 'Zuhause Möwenweg', seit: '2026-09-01 10:00:00' }] })
  api.rahmenGeraete.mockResolvedValue({ geraete: [{ id: 5, name: 'Küche', auswahl: { tiere: [12], privat: false } }] })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.clearAllMocks()
  setLang('de')
})

describe('Wer sieht was', () => {
  test('je Tier: Familien-Schalter, Gäste, Tierheim, Bilderrahmen und Zahlen - nur eigene Tiere', async () => {
    await render()
    expect(container.querySelector('.sicht-legende').textContent).toContain('Privat')
    expect([...container.querySelectorAll('.sicht-tier h3')].map((el) => el.textContent)).toEqual(['Benno', 'Wilma'])
    const benno = card('Benno')
    expect(switchIn(benno, 'Familie Sonnenhang').checked).toBe(true)
    expect(switchIn(benno, 'Tierheim Flocke darf mitlesen').checked).toBe(true)
    expect(benno.textContent).toContain('1 Gast sieht Benno (nur lesen)')
    expect(benno.textContent).toContain('1 private · 4 geteilte Erinnerungen')
    expect(card('Wilma').textContent).toContain('Bilderrahmen: Küche')
  })

  test('ein Schalter ändert die Freigabe über PUT /dogs/:id/shares und die Zahlen in me', async () => {
    api.setDogShares.mockResolvedValue({ shares: [4] })
    await render()
    await act(async () => switchIn(card('Wilma'), 'Familie Talgrund').click())
    expect(api.setDogShares).toHaveBeenCalledWith(12, [4])
    expect(onFamilyChange).toHaveBeenCalled()
  })

  test('Tierheim-Schalter aus: PUT /shelter-share ohne Happy-End-Einwilligung', async () => {
    api.setShelterShare.mockResolvedValue({ shelterName: 'Tierheim Flocke', enabled: false, storyConsent: false })
    await render()
    await act(async () => switchIn(card('Benno'), 'Tierheim Flocke darf mitlesen').click())
    expect(api.setShelterShare).toHaveBeenCalledWith(11, { enabled: false, storyConsent: false })
    expect(switchIn(card('Benno'), 'Tierheim Flocke darf mitlesen').checked).toBe(false)
  })

  test('?tier= zeigt nur dieses Tier; „Erinnerungen ansehen“ springt gefiltert zu den Erinnerungen', async () => {
    await render('/einstellungen?bereich=sichtbarkeit&tier=12')
    expect([...container.querySelectorAll('.sicht-tier h3')].map((el) => el.textContent)).toEqual(['Wilma'])
    await act(async () => byText('button', 'Erinnerungen ansehen').click())
    expect(location.search).toBe('?bereich=sichtbarkeit&tier=12&ansicht=erinnerungen')
    expect([...container.querySelectorAll('.sicht-erinnerung strong')].map((el) => el.textContent)).toEqual(['Im Garten'])
  })

  test('Erinnerungen: Sichtbarkeit je Eintrag, umschalten über PUT /timeline/:id mit allen Feldern, Filter „Alle privaten“', async () => {
    api.updateTimelineEntry.mockResolvedValue({ ...entries[0], privat: 0 })
    await render('/einstellungen?bereich=sichtbarkeit&ansicht=erinnerungen')
    const rows = () => [...container.querySelectorAll('.sicht-erinnerung')]
    expect(rows().map((row) => row.querySelector('strong').textContent)).toEqual(['Am See', 'Im Garten'])
    expect(rows()[0].textContent).toContain('Privat – nur ihr')
    expect(rows()[1].textContent).toContain('Geteilt – sehen eure Gäste')

    await act(async () => byText('button', 'Alle privaten anzeigen (1)').click())
    expect(rows().map((row) => row.querySelector('strong').textContent)).toEqual(['Am See'])

    await act(async () => byText('.sicht-erinnerung button', 'Teilen').click())
    expect(api.updateTimelineEntry).toHaveBeenCalledWith(101, {
      autorName: 'Pepper',
      datum: '2026-09-01',
      titel: 'Am See',
      text: 'Schön',
      fotoUrls: ['/uploads/a.jpg'],
      privat: false
    })
    await act(async () => byText('.sicht-filter-chips button', 'Alle').click())
    expect(rows()[0].textContent).toContain('Geteilt – sehen Familie Sonnenhang und eure Gäste')
  })

  test('Familien & Gäste: Gast entfernen über DELETE /besuche/gaeste/:id', async () => {
    api.removeGuest.mockResolvedValue({})
    await render('/einstellungen?bereich=sichtbarkeit&ansicht=verbindungen')
    expect(container.querySelectorAll('.share-card')).toHaveLength(2)
    const remove = container.querySelector('button[aria-label="Zuhause Möwenweg als Gast entfernen"]')
    await act(async () => remove.click())
    await act(async () => byText('button', 'Wirklich entfernen?').click())
    expect(api.removeGuest).toHaveBeenCalledWith(9)
    expect(container.textContent).toContain('Gerade hat niemand Gast-Zugang.')
  })

  test('So sieht es …: eine Familie sieht nur geteilte Tiere, ein Gast alle', async () => {
    await render('/einstellungen?bereich=sichtbarkeit&ansicht=vorschau')
    const names = () => [...container.querySelectorAll('.sicht-vorschau-list strong')].map((el) => el.textContent)
    expect(names()).toEqual(['Benno'])
    expect(container.querySelector('.sicht-vorschau').textContent).toContain('4 Erinnerungen sichtbar · 1 private nicht')
    const select = container.querySelector('.sicht-panel select')
    await act(async () => {
      select.value = 'gast-9'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(names()).toEqual(['Benno', 'Wilma'])
  })

  test('Demo: Schalter gesperrt', async () => {
    await render('/einstellungen?bereich=sichtbarkeit', { ...family, isDemo: true })
    expect(switchIn(card('Benno'), 'Familie Sonnenhang').disabled).toBe(true)
  })

  test('Englisch', async () => {
    setLang('en')
    await render()
    expect(container.querySelector('[role="tablist"]').textContent).toContain('Families & guests')
    expect(card('Benno').textContent).toContain('1 private · 4 shared memories')
    expect(container.querySelector('.sicht-legende').textContent).toContain('only you – the people in your home.')
  })
})
