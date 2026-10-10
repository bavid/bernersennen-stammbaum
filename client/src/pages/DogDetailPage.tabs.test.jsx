// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { getDog, listTimeline, listBreedingEvents, listAllDogs, setDogShares } = vi.hoisted(() => ({
  setDogShares: vi.fn(),
  getDog: vi.fn(),
  listTimeline: vi.fn(),
  listBreedingEvents: vi.fn(),
  listAllDogs: vi.fn()
}))
vi.mock('../api', () => ({ api: { getDog, listTimeline, listBreedingEvents, listAllDogs, setDogShares, erlebtMitTiere: () => Promise.resolve([]) } }))

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

async function render(url = '/tier/10', { family = home, state, entries = [entry], dog = nele(), onFamilyChange = () => {} } = {}) {
  getDog.mockResolvedValue(dog)
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
                  <DogDetailPage family={family} onFamilyChange={onFamilyChange} />
                  <LocationProbe />
                </>
              }
            />
            <Route path="*" element={<LocationProbe />} />
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
  for (const mock of [getDog, listTimeline, listBreedingEvents, listAllDogs, setDogShares]) mock.mockReset()
})

describe('Tierprofil – Kopf und Reiter (Phase W, Schritt 2)', () => {
  test('kompakter Kopf: Name, eine Zeile, "Sichtbar in", Bearbeiten · ⋯ (Erzählen steht in der Chronik); Reiter Chronik · Infos · Verwandte', async () => {
    await render()
    expect(container.querySelector('.dog-head h1').textContent).toBe('Nele')
    expect(container.querySelector('.dog-head-line').textContent).toContain('Mischling · ')
    expect(container.querySelector('.dog-head-line').textContent).toContain('bei euch seit 12. Juni 2021')
    expect(container.querySelector('.dog-head-visible').textContent).toBe('Sichtbar in: Familie Sonnenhang')
    // Im Reiter Chronik ist das Erzählen-Feld der eine Einstieg - kein zweiter Knopf im Kopf (UX-Audit).
    expect(button(words.tellAction)).toBeUndefined()
    expect(container.querySelector('.composer-trigger')).not.toBeNull()
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

  test('eine neue Freigabe zieht die Zahlen in me mit (Familien-Liste, Start - code-review W2)', async () => {
    const counted = { ...home, memberships: home.memberships.map((m) => ({ ...m, tiere: m.id === 2 ? 21 : 6, eigeneTiere: m.id === 2 ? 4 : 0 })) }
    const onFamilyChange = vi.fn()
    setDogShares.mockResolvedValue({ shares: [2, 5] })
    await render('/tier/10?reiter=infos', { family: counted, onFamilyChange })
    const moewenweg = [...container.querySelectorAll('.share-switch')].find((el) => el.textContent.includes('Familie Möwenweg')).querySelector('input')
    await act(async () => moewenweg.click())

    expect(setDogShares).toHaveBeenCalledWith(10, [2, 5])
    const update = onFamilyChange.mock.calls.at(-1)[0]
    expect(update(counted).memberships.map(({ tiere, eigeneTiere }) => [tiere, eigeneTiere])).toEqual([
      [21, 4],
      [7, 1]
    ])
    expect(container.querySelector('.dog-head-visible').textContent).toBe('Sichtbar in: Familie Sonnenhang, Familie Möwenweg')
  })

  // Geschlecht „weiß ich nicht“: in den Infos „unbekannt“ wie ein fehlender Geburtstag - nie Hündin oder Rüde.
  test('Infos: Geschlecht bekannt als Hündin, unbekannt als "unbekannt"', async () => {
    const fact = () => [...container.querySelectorAll('.dog-info-facts > div')].find((row) => row.querySelector('dt').textContent === 'Geschlecht')
    await render('/tier/10?reiter=infos')
    expect(fact().querySelector('dd').textContent).toBe('Hündin')
    act(() => root.unmount())
    root = null
    container.remove()

    await render('/tier/10?reiter=infos', { dog: nele({ geschlecht: 'unbekannt' }) })
    expect(fact().querySelector('dd').textContent).toBe('unbekannt')
    expect(container.querySelector('.dog-info-facts').textContent).not.toMatch(/Hündin|Rüde/)
  })

  // UX-Audit: „Geschlecht: Katze“ - das Feld zeigte bei einer Kätzin das Wort der Tierart.
  test('Infos: Geschlecht einer Kätzin ist "weiblich", nie die Tierart', async () => {
    const fact = () => [...container.querySelectorAll('.dog-info-facts > div')].find((row) => row.querySelector('dt').textContent === 'Geschlecht')
    await render('/tier/10?reiter=infos', { dog: nele({ tierart: 'katze', geschlecht: 'huendin' }) })
    expect(fact().querySelector('dd').textContent).toBe('weiblich')
  })

  test('#entry-N erzwingt die Chronik, auch mit ?reiter=infos', async () => {
    await render('/tier/10?reiter=infos#entry-5')
    expect(selectedTab()).toBe('Chronik')
    expect(container.querySelector('#entry-5')).not.toBeNull()
  })

  test('?neu=1 öffnet gleich das Erzählen und nimmt den Parameter wieder aus der Adresse - location.state bleibt', async () => {
    await render('/tier/10?neu=1', { state: { from: '/start' } })
    expect(container.querySelector('#composer.is-open')).not.toBeNull()
    expect(container.querySelector('.composer-title').textContent).toBe(`${words.newEntry} zu Nele`)
    expect(location.search).toBe('')
    expect(location.state).toEqual({ from: '/start' })
    expect(container.querySelector('.back-link').getAttribute('href')).toBe('/start')
  })

  test('?neu=1 ohne Schreibrecht: kein Erzählen, der Parameter verschwindet trotzdem', async () => {
    await render('/tier/10?neu=1', { family: { ...home, art: 'rudel', id: 2, role: 'gast', memberships: [] } })
    expect(container.querySelector('#composer')).toBeNull()
    expect(location.search).toBe('')
  })

  test('ein Reiter nimmt #entry-N aus der Adresse - danach gilt der gewählte Reiter', async () => {
    await render('/tier/10#entry-5')
    await act(async () => tab('Infos').click())
    expect(location.hash).toBe('')
    expect(selectedTab()).toBe('Infos')
  })

  // UX-Audit: ein Einstieg für neue Erinnerungen - „Mehrere Fotos auf einmal“ steckt im Erzählen-Feld, kein eigener Knopf.
  test('Chronik: „Mehrere Fotos auf einmal“ im Erzählen-Feld, kein eigener „Fotos mitbringen“-Knopf daneben', async () => {
    await render()
    const extra = container.querySelector('#composer .composer-extra .chronicle-import')
    expect(extra.textContent).toBe('Mehrere Fotos auf einmal')
    expect(container.querySelectorAll('.chronicle-import')).toHaveLength(1)
    expect(button('Fotos mitbringen')).toBeUndefined()
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

  test('⋯ Weitere Aktionen: Menü mit Pfeiltasten; Escape gibt den Fokus zurück', async () => {
    await render()
    const trigger = container.querySelector('.dog-more-trigger')
    await act(async () => trigger.click())
    const items = () => [...container.querySelectorAll('[role="menuitem"]')]
    // „Wer sieht …?“ hat seinen Ort (Chip, Infos) - nicht doppelt im ⋯.
    expect(items().map((item) => item.textContent)).toEqual(['Als Bilderrahmen zeigen', 'Vermisst? Suchplakat erstellen', 'Link kopieren'])
    expect(document.activeElement).toBe(items()[0])
    await act(async () => items()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
    expect(document.activeElement).toBe(items()[1])
    await act(async () => items()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(items()).toHaveLength(0)
    expect(document.activeElement).toBe(trigger)

  })

  test('⋯ „Als Bilderrahmen zeigen“: die Diashow nur mit den Fotos dieses Tiers', async () => {
    await render()
    await act(async () => container.querySelector('.dog-more-trigger').click())
    const item = [...container.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent === 'Als Bilderrahmen zeigen')
    await act(async () => item.click())
    expect(`${location.pathname}${location.search}`).toBe('/bilderrahmen?tier=10')
  })

  test('⋯ „Vermisst? Suchplakat erstellen“ führt zur Druckseite des Plakats', async () => {
    await render()
    await act(async () => container.querySelector('.dog-more-trigger').click())
    const item = [...container.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent === 'Vermisst? Suchplakat erstellen')
    await act(async () => item.click())
    expect(location.pathname).toBe('/tier/10/vermisst')
  })

  test('die Chronik zeigt zuerst die jüngsten vier - "Frühere Erinnerungen anzeigen" holt den Rest; #entry-N klappt auf', async () => {
    const many = [1, 2, 3, 4, 5].map((n) => ({ ...entry, id: n, datum: `202${n}-01-0${n}`, titel: `Erinnerung ${n}` }))
    await render('/tier/10', { entries: many })
    // Geburt, Einzug und fünf Erinnerungen = sieben Punkte, davon die jüngsten vier zu sehen
    expect(container.querySelectorAll('.timeline-item')).toHaveLength(4)
    await act(async () => button(`Frühere ${words.entries} anzeigen (3)`).click())
    expect(container.querySelectorAll('.timeline-item')).toHaveLength(7)
    // Der Knopf ist weg - der Fokus steht auf der Überschrift der Chronik (code-review W2)
    expect(document.activeElement).toBe(container.querySelector('#chronicle-title'))

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

  test('eine Id aus der Adresse, die keine Zahl ist, fragt den Server gar nicht erst (security-review W2)', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/tier/..%2F..%2Fvouchers%2Fmine']}>
          <ThemeProvider themeId="standard">
            <Routes>
              <Route path="/tier/:id" element={<DogDetailPage family={home} onFamilyChange={() => {}} />} />
            </Routes>
          </ThemeProvider>
        </MemoryRouter>
      )
    )
    expect(getDog).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]').textContent).toBe('Dieses Tier gibt es hier nicht.')
  })

  test('zu Besuch: nichts schreiben, kein "Sichtbar in", statt ⋯ gleich der Knopf "Link kopieren"', async () => {
    const visit = { ...home, id: 9, name: 'Zuhause Möwenweg', zuBesuch: true, role: 'gast', memberships: [] }
    await render('/tier/10', { family: visit, dog: nele({ isOwn: false, canEdit: false, ownerFamilyId: 9, familyName: 'Zuhause Möwenweg' }) })
    expect(button(words.tellAction)).toBeUndefined()
    expect(container.querySelector('.dog-head-visible')).toBeNull()
    expect(container.querySelector('.visit-chip').textContent).toBe('Zu Besuch · Zurück zu Mein Zuhause')
    // Ein einziger Eintrag braucht kein Menü (UX-Audit).
    expect(container.querySelector('.dog-more-trigger')).toBeNull()
    expect(container.querySelector('.dog-more-single').textContent).toBe('Link kopieren')
  })
})
