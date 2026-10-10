// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import TourProvider from './TourProvider.jsx'
import TourRestart from './TourRestart.jsx'
import { api } from '../../api.js'
import { setLang } from '../../lib/i18n/index.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const HOME = { id: 7, art: 'zuhause', home: { id: 7, art: 'zuhause' }, role: 'leitung', rundgang: 'neu' }

let container
let root
let pathname

beforeAll(() => {
  // jsdom rechnet kein Layout: sichtbar ist, was nicht in einem [hidden] steckt.
  Element.prototype.checkVisibility = function checkVisibility() {
    return !this.closest('[hidden]')
  }
})

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  vi.restoreAllMocks()
  window.localStorage.clear()
  window.sessionStorage.clear()
  setLang('de')
})

function Where() {
  pathname = useLocation().pathname
  return null
}

// Die echte App in klein: Kopf mit Entdecken, Glocke und Menü; Start ohne Composer, Tiere ohne Tier.
function Shell({ withAnimal }) {
  return (
    <>
      <nav className="app-nav">
        <a href="/entdecken">Entdecken</a>
      </nav>
      <button type="button" className="hinweis-glocke-knopf">
        Glocke
      </button>
      <button type="button" className="account-menu-trigger">
        Menü
      </button>
      <TourRestart />
      <Routes>
        <Route path="/start" element={<section id="start-news">News</section>} />
        <Route
          path="/tiere"
          element={
            <div className="animals-page">
              <section className="animal-grid">{withAnimal && <a className="animal-tile" href="/tier/1">Bello</a>}</section>
            </div>
          }
        />
        <Route path="/familien" element={<div className="families-page-grid">Familien</div>} />
        <Route path="*" element={<p>Andere Seite</p>} />
      </Routes>
    </>
  )
}

async function render(family = HOME, { path = '/start', withAnimal = false, onFamilyChange = vi.fn() } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Where />
        <TourProvider family={family} onFamilyChange={onFamilyChange} waitMs={60} autoPrompt>
          <Shell withAnimal={withAnimal} />
        </TourProvider>
      </MemoryRouter>
    )
  )
  return onFamilyChange
}

async function waitFor(check, tries = 40) {
  for (let i = 0; i < tries; i += 1) {
    if (check()) return
    await act(() => new Promise((resolve) => setTimeout(resolve, 25)))
  }
  expect(check()).toBe(true)
}

const button = (text) => [...document.body.querySelectorAll('button')].find((el) => el.textContent.trim() === text)
const prompt = () => document.body.querySelector('.tour-prompt')
const pop = () => document.body.querySelector('.tour-pop')
const popTitle = () => pop()?.querySelector('h2')?.textContent
const click = async (el) => act(async () => el.click())
const choice = () => document.body.querySelector('.tour-choice')
const choiceTitles = () => [...choice().querySelectorAll('.tour-choice-title')].map((el) => el.textContent.replace('✓ ', ''))

describe('Rundgang', () => {
  test('fragt einmal auf Start; „Schließen“ merkt sich „fertig“ und fragt nicht wieder', async () => {
    const spy = vi.spyOn(api, 'setRundgang').mockResolvedValue({ rundgang: 'fertig' })
    const onFamilyChange = await render()
    expect(prompt().textContent).toContain('Möchtet ihr einen kurzen Rundgang?')
    expect(document.activeElement).toBe(prompt())
    await click(button('Schließen'))
    expect(prompt()).toBeNull()
    expect(spy).toHaveBeenCalledWith('fertig')
    expect(onFamilyChange).toHaveBeenCalled()
    act(() => root.unmount())
    root = null
    await render({ ...HOME, rundgang: 'fertig' })
    expect(prompt()).toBeNull()
  })

  test('„Nicht mehr zeigen“ speichert „aus“; außerhalb von Start wird nicht gefragt', async () => {
    const spy = vi.spyOn(api, 'setRundgang').mockResolvedValue({ rundgang: 'aus' })
    await render()
    await click(button('Nicht mehr zeigen'))
    expect(spy).toHaveBeenCalledWith('aus')
    act(() => root.unmount())
    root = null
    window.sessionStorage.clear()
    await render(HOME, { path: '/tiere' })
    expect(prompt()).toBeNull()
  })

  test('Demo fragt höchstens einmal je Sitzung und speichert nichts am Server', async () => {
    const spy = vi.spyOn(api, 'setRundgang')
    await render({ ...HOME, isDemo: true })
    expect(prompt()).not.toBeNull()
    act(() => root.unmount())
    root = null
    await render({ ...HOME, isDemo: true })
    expect(prompt()).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  test('Schritte: fehlendes Ziel wird übersprungen, Rückfrage ohne Tier, Weiter/Zurück, Ansage, Escape beendet', async () => {
    const spy = vi.spyOn(api, 'setRundgang').mockResolvedValue({ rundgang: 'fertig' })
    await render()
    await click(button('Kurz das Wichtigste'))
    await waitFor(() => popTitle() === 'Start: eure Neuigkeiten')
    expect(pop().textContent).toContain('Schritt 1 von 4')
    expect(document.activeElement).toBe(pop())
    expect(document.body.querySelector('[aria-live="polite"]').textContent).toContain('Start: eure Neuigkeiten')

    // Kein Composer auf Start -> weiter zu den Tieren, dort die Rückfrage (noch kein Tier).
    await click(button('Weiter'))
    await waitFor(() => popTitle() === 'Habt ihr schon ein Tier angelegt?')
    expect(pathname).toBe('/tiere')

    await click(button('Zurück'))
    // Zurück überspringt den fehlenden Composer ebenfalls und landet wieder auf Start.
    await waitFor(() => popTitle() === 'Start: eure Neuigkeiten')
    act(() => pop().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    await waitFor(() => popTitle() === 'Habt ihr schon ein Tier angelegt?')

    await click(button('Weiter'))
    await waitFor(() => popTitle() === 'Familien & „Mit dabei“')
    expect(pathname).toBe('/familien')

    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(pop()).toBeNull()
    expect(spy).toHaveBeenCalledWith('fertig')
  })

  test('„Kurz das Wichtigste“ endet nach Kapitel 1 ohne Auswahlkarte', async () => {
    const spy = vi.spyOn(api, 'setRundgang').mockResolvedValue({ rundgang: 'fertig' })
    await render(HOME, { withAnimal: true })
    await click(button('Kurz das Wichtigste'))
    await waitFor(() => popTitle() === 'Start: eure Neuigkeiten')
    await click(button('Weiter'))
    await waitFor(() => popTitle() === 'Eure Tiere')
    await click(button('Weiter'))
    await waitFor(() => popTitle() === 'Familien & „Mit dabei“')
    await click(button('Fertig'))
    expect(pop()).toBeNull()
    expect(choice()).toBeNull()
    expect(spy).toHaveBeenCalledWith('fertig')
  })

  test('„Alles zeigen“: nach Kapitel 1 die Karte – nächstes Kapitel vorgewählt, Gezeigtes abgehakt, „Fertig“ speichert', async () => {
    const spy = vi.spyOn(api, 'setRundgang').mockResolvedValue({ rundgang: 'fertig' })
    await render(HOME, { withAnimal: true })
    await click(button('Alles zeigen'))
    await waitFor(() => popTitle() === 'Start: eure Neuigkeiten')
    await click(button('Weiter'))
    await waitFor(() => popTitle() === 'Eure Tiere')
    await click(button('Weiter'))
    await waitFor(() => popTitle() === 'Familien & „Mit dabei“')
    expect(pop().textContent).toContain('Das Wichtigste')
    expect(button('Fertig')).toBeUndefined()
    await click(button('Weiter'))
    await waitFor(() => choice() !== null)
    expect(choice().querySelector('h2').textContent).toBe('Wie geht’s weiter?')
    expect(document.body.querySelector('[aria-live="polite"]').textContent).toBe('Wie geht’s weiter?')
    expect(choiceTitles()).toEqual(['Entdecken', 'Werkzeuge', 'Verwaltung'])
    expect(document.activeElement.textContent).toContain('Entdecken')
    expect(document.activeElement.classList.contains('is-next')).toBe(true)

    await click(document.activeElement)
    await waitFor(() => popTitle() === 'Entdecken')
    expect(pop().textContent).toContain('Schritt 1 von 3')
    // „Mein Revier“ gibt es hier nicht: kurz gesucht, dann übersprungen.
    await click(button('Weiter'))
    await waitFor(() => popTitle() === 'Die Glocke: eure Hinweise')
    await click(button('Weiter'))
    await waitFor(() => choice() !== null)
    const seen = [...choice().querySelectorAll('.tour-choice-btn.is-done')]
    expect(seen.map((el) => el.getAttribute('aria-label'))).toEqual(['Entdecken (schon gesehen)'])
    expect(choice().querySelector('.is-next').textContent).toContain('Werkzeuge')
    expect(spy).not.toHaveBeenCalled()
    await click(button('Fertig'))
    expect(choice()).toBeNull()
    expect(spy).toHaveBeenCalledWith('fertig')
  })

  test('Demo je Art: Zuhause geschlossen – Partner fragt trotzdem; Partner „aus“ – Zuhause bleibt still', async () => {
    const spy = vi.spyOn(api, 'setRundgang')
    const homeDemo = { ...HOME, id: 2, home: { id: 2, art: 'zuhause' }, isDemo: true }
    const partnerDemo = { id: 9, art: 'partner', isDemo: true, rundgang: 'neu' }
    await render(homeDemo)
    await click(button('Schließen'))
    act(() => root.unmount())
    root = null
    await render(partnerDemo, { path: '/profil' })
    expect(prompt()).not.toBeNull()
    await click(button('Nicht mehr zeigen'))
    act(() => root.unmount())
    root = null
    await render(homeDemo)
    expect(prompt()).toBeNull()
    window.sessionStorage.clear()
    act(() => root.unmount())
    root = null
    await render(homeDemo)
    expect(prompt()).not.toBeNull()
    act(() => root.unmount())
    root = null
    await render(partnerDemo, { path: '/profil' })
    expect(prompt()).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  test('Neustart aus den Einstellungen und Sprung in ein Kapitel', async () => {
    vi.spyOn(api, 'setRundgang').mockResolvedValue({})
    await render({ ...HOME, rundgang: 'aus' }, { path: '/einstellungen' })
    expect(prompt()).toBeNull()
    await click(button('Verwaltung'))
    await waitFor(() => popTitle() === 'Wer sieht was – und wann?')
    expect(pop().textContent).toContain('Verwaltung')
    await click(button('Beenden'))
    expect(pop()).toBeNull()
  })

  test('ohne Provider steht kein Neustart da; Englisch', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(<TourRestart />))
    expect(container.textContent).toBe('')
    act(() => root.unmount())
    root = null
    setLang('en')
    await render()
    expect(prompt().textContent).toContain('Would you like a short tour?')
    expect(button('Just the essentials')).toBeTruthy()
    await click(button('Discover'))
    await waitFor(() => popTitle() === 'Discover')
    await click(button('Next'))
    await waitFor(() => popTitle() === 'The bell: your notifications')
    await click(button('Next'))
    await waitFor(() => choice() !== null)
    expect(choice().querySelector('h2').textContent).toBe('What’s next?')
    expect(choice().querySelector('.is-next').textContent).toContain('Tools')
    expect(button('Done')).toBeTruthy()
  })
})
