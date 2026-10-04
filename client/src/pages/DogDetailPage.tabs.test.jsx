// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { getDog, listTimeline, listBreedingEvents, listAllDogs } = vi.hoisted(() => ({
  getDog: vi.fn(),
  listTimeline: vi.fn(),
  listBreedingEvents: vi.fn(),
  listAllDogs: vi.fn()
}))
vi.mock('../api', () => ({ api: { getDog, listTimeline, listBreedingEvents, listAllDogs, erlebtMitTiere: () => Promise.resolve([]) } }))

import DogDetailPage from './DogDetailPage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'
import { getTheme } from '../themes/index.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close() {
    this.open = false
  }
}

const words = getTheme('standard').words
let container
let root
let location

// Das eigene Zuhause (aktiv) in zwei Familien; Nele ist in Familie Sonnenhang geteilt.
const home = {
  id: 1,
  name: 'Zuhause am Deich',
  theme: 'standard',
  art: 'zuhause',
  role: 'leitung',
  home: { id: 1, name: 'Zuhause am Deich', art: 'zuhause' },
  memberships: [
    { id: 2, name: 'Familie Sonnenhang', rolle: 'mitglied' },
    { id: 5, name: 'Familie Möwenweg', rolle: 'mitglied' }
  ]
}

const nele = (extra = {}) => ({
  id: 10,
  name: 'Nele',
  name_unbekannt: false,
  tierart: 'hund',
  geschlecht: 'huendin',
  geburtsdatum: '2019-03-10',
  rasse: 'Mischling',
  beschreibung: 'Anfangs schüchtern, heute die Chefin am Deich.',
  foto_url: null,
  familyName: 'Zuhause am Deich',
  ownerFamilyId: 1,
  isOwn: true,
  canEdit: true,
  shares: [2],
  mother: null,
  father: null,
  children: [],
  siblings: [],
  housemates: [],
  bei_uns_seit: '2021-06-12',
  bei_uns_bis: null,
  ...extra
})

const entry = { id: 5, dog_id: 10, autor_name: 'Zuhause am Deich', datum: '2021-06-13', titel: 'Nele zieht ein', text: '', foto_urls: [], privat: 0, comments: [] }

function LocationProbe() {
  location = useLocation()
  return null
}

async function render(url = '/tier/10', { family = home, state, entries = [entry] } = {}) {
  getDog.mockResolvedValue(nele())
  listTimeline.mockResolvedValue(entries)
  listBreedingEvents.mockResolvedValue([])
  listAllDogs.mockResolvedValue([])
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[{ pathname: url.split(/[?#]/)[0], search: url.match(/\?[^#]*/)?.[0] || '', hash: url.match(/#.*/)?.[0] || '', state }]}>
        <ThemeProvider themeId="standard">
          <Routes>
            <Route
              path="/tier/:id"
              element={
                <>
                  <DogDetailPage family={family} onFamilyChange={() => {}} />
                  <LocationProbe />
                </>
              }
            />
          </Routes>
        </ThemeProvider>
      </MemoryRouter>
    )
  )
  // requestAnimationFrame (Fokus/Scroll nach einem Reiterwechsel)
  await act(async () => new Promise((resolve) => requestAnimationFrame(resolve)))
}

const tabs = () => [...container.querySelectorAll('[role="tab"]')]
const tab = (label) => tabs().find((button) => button.textContent === label)
const selectedTab = () => tabs().find((button) => button.getAttribute('aria-selected') === 'true')?.textContent
const button = (text) => [...container.querySelectorAll('button')].find((btn) => btn.textContent.includes(text))

async function flushFrame() {
  await act(async () => new Promise((resolve) => requestAnimationFrame(resolve)))
}

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  for (const mock of [getDog, listTimeline, listBreedingEvents, listAllDogs]) mock.mockReset()
})

describe('Tierprofil – Kopf und Reiter (Phase W, Schritt 2)', () => {
  test('kompakter Kopf: Name, eine Zeile, "Sichtbar in", Erzählen · Bearbeiten · ⋯; Reiter Chronik · Infos · Verwandte', async () => {
    await render()
    expect(container.querySelector('.dog-head h1').textContent).toBe('Nele')
    expect(container.querySelector('.dog-head-line').textContent).toContain('Mischling · ')
    expect(container.querySelector('.dog-head-line').textContent).toContain('bei euch seit 12. Juni 2021')
    expect(container.querySelector('.dog-head-visible').textContent).toBe('Sichtbar in: Familie Sonnenhang')
    expect(button(words.tellAction)).toBeDefined()
    expect(button('Bearbeiten')).toBeDefined()
    expect(container.querySelector('.dog-more-trigger').getAttribute('aria-label')).toBe('Weitere Aktionen für Nele')
    expect(tabs().map((t) => t.textContent)).toEqual(['Chronik', 'Infos', 'Verwandte'])
    expect(selectedTab()).toBe('Chronik')
    expect(container.querySelector('#tier-panel').getAttribute('aria-labelledby')).toBe('tier-tab-chronik')
  })

  test('ein Reiter schreibt die Adresse (?reiter=) und behält location.state', async () => {
    await render('/tier/10', { state: { from: '/start' } })
    await act(async () => tab('Infos').click())
    expect(location.search).toBe('?reiter=infos')
    expect(location.state).toEqual({ from: '/start' })
    expect(container.querySelector('.dog-info-description').textContent).toContain('Chefin am Deich')
    expect(container.querySelector('#share-panel-title').textContent).toBe('Wer sieht Nele?')
  })

  test('#entry-N erzwingt die Chronik, auch mit ?reiter=infos', async () => {
    await render('/tier/10?reiter=infos#entry-5')
    expect(selectedTab()).toBe('Chronik')
    expect(container.querySelector('#entry-5')).not.toBeNull()
  })

  test('?neu=1 öffnet gleich das Erzählen und nimmt den Parameter wieder aus der Adresse', async () => {
    await render('/tier/10?neu=1')
    expect(container.querySelector('#composer.is-open')).not.toBeNull()
    expect(container.querySelector('.composer-title').textContent).toBe(`${words.newEntry} zu Nele`)
    expect(location.search).toBe('')
  })

  test('"Erinnerung festhalten" im Kopf springt aus den Infos in die Chronik und öffnet das Erzählen', async () => {
    await render('/tier/10?reiter=infos')
    await act(async () => button(words.tellAction).click())
    await flushFrame()
    expect(selectedTab()).toBe('Chronik')
    expect(container.querySelector('#composer.is-open')).not.toBeNull()
  })

  test('"Sichtbar in" führt zu "Wer sieht Nele?" in den Infos und setzt den Fokus dorthin', async () => {
    await render()
    await act(async () => container.querySelector('.dog-head-visible').click())
    await flushFrame()
    expect(selectedTab()).toBe('Infos')
    expect(document.activeElement).toBe(container.querySelector('#share-panel-title'))
  })

  test('⋯ Weitere Aktionen: Menü mit Pfeiltasten, "Wer sieht Nele?" führt in die Infos; Escape gibt den Fokus zurück', async () => {
    await render()
    const trigger = container.querySelector('.dog-more-trigger')
    await act(async () => trigger.click())
    const items = () => [...container.querySelectorAll('[role="menuitem"]')]
    expect(items().map((item) => item.textContent)).toEqual(['Wer sieht Nele?', 'Link kopieren'])
    expect(document.activeElement).toBe(items()[0])
    await act(async () => items()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
    expect(document.activeElement).toBe(items()[1])
    await act(async () => items()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(items()).toHaveLength(0)
    expect(document.activeElement).toBe(trigger)

    await act(async () => trigger.click())
    await act(async () => items()[0].click())
    await flushFrame()
    expect(selectedTab()).toBe('Infos')
  })

  test('die Chronik zeigt zuerst die jüngsten vier - "Frühere Erinnerungen anzeigen" holt den Rest; #entry-N klappt auf', async () => {
    const many = [1, 2, 3, 4, 5].map((n) => ({ ...entry, id: n, datum: `202${n}-01-0${n}`, titel: `Erinnerung ${n}` }))
    await render('/tier/10', { entries: many })
    // Geburt, Einzug und fünf Erinnerungen = sieben Punkte, davon die jüngsten vier zu sehen
    expect(container.querySelectorAll('.timeline-item')).toHaveLength(4)
    await act(async () => button(`Frühere ${words.entries} anzeigen (3)`).click())
    expect(container.querySelectorAll('.timeline-item')).toHaveLength(7)

    act(() => root.unmount())
    root = null
    container.remove()
    await render('/tier/10#entry-1', { entries: many })
    expect(container.querySelectorAll('.timeline-item')).toHaveLength(7)
    expect(container.querySelector('#entry-1')).not.toBeNull()
  })

  test('Zurück-Link: dorthin, woher man kam (state.from), sonst zu den Tieren; fremde Adressen zählen nicht', async () => {
    await render('/tier/10', { state: { from: '/familien/2?reiter=beitraege' } })
    expect(container.querySelector('.back-link').getAttribute('href')).toBe('/familien/2?reiter=beitraege')
    expect(container.querySelector('.back-link').textContent.trim()).toBe('Zurück')

    act(() => root.unmount())
    root = null
    container.remove()
    await render('/tier/10', { state: { from: '//evil.example' } })
    expect(container.querySelector('.back-link').getAttribute('href')).toBe('/tiere')
    expect(container.querySelector('.back-link').textContent.trim()).toBe('Tiere')
  })

  test('zu Besuch: nichts schreiben, kein "Sichtbar in", ⋯ nur "Link kopieren"', async () => {
    const visit = { ...home, id: 9, name: 'Zuhause Möwenweg', zuBesuch: true, role: 'gast', memberships: [] }
    getDog.mockResolvedValue(nele({ isOwn: false, canEdit: false, ownerFamilyId: 9, familyName: 'Zuhause Möwenweg' }))
    await render('/tier/10', { family: visit })
    getDog.mockResolvedValue(nele({ isOwn: false, canEdit: false, ownerFamilyId: 9, familyName: 'Zuhause Möwenweg' }))
    expect(button(words.tellAction)).toBeUndefined()
    expect(container.querySelector('.dog-head-visible')).toBeNull()
  })
})
