// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import PartnerDemoGuide, { DEMO_GUIDE_SEEN_KEY, DEMO_GUIDE_SETTING } from './PartnerDemoGuide.jsx'
import TourProvider from './tour/TourProvider.jsx'
import { TourBusyContext } from './tour/tourContext.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
let navigate

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  vi.restoreAllMocks()
  window.localStorage.clear()
  window.sessionStorage.clear()
})

function Navigator() {
  navigate = useNavigate()
  return null
}

function Page() {
  return (
    <main>
      <PartnerDemoGuide />
      <div className="page">
        <h1>Hundeschule Pfotenglück</h1>
      </div>
    </main>
  )
}

async function mount(path, content) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Navigator />
        {content}
      </MemoryRouter>
    )
  )
  return container
}

const render = (path = '/profil') => mount(path, <Page />)
const DEMO_PARTNER = { id: 20, name: 'Hundeschule Ufer', art: 'partner', isDemo: true, role: 'leitung', home: { id: 20, art: 'partner' }, memberships: [] }
const tourPrompt = () => document.body.querySelector('.tour-prompt')

const guide = () => container.querySelector('.demo-guide')

describe('PartnerDemoGuide', () => {
  // Audit: der Hinweis stand auf jeder Seite und wiederholte Umschalter und Menü (~330 px).
  test('steht nur auf der Startseite /profil', async () => {
    await render('/beitraege')
    expect(guide()).toBeNull()

    await act(async () => navigate('/profil'))
    expect(guide()).not.toBeNull()
  })

  test('keine eigenen Wege mehr - kein Link, der Umschalter oder Menü wiederholt', async () => {
    await render()
    expect(guide().querySelectorAll('a')).toHaveLength(0)
    expect(guide().textContent).not.toMatch(/Beiträge|Tiere/)
  })

  test('nur einmal je Sitzung: nach dem Verlassen von /profil kommt er nicht wieder', async () => {
    await render()
    expect(guide()).not.toBeNull()

    await act(async () => navigate('/kalender'))
    await act(async () => navigate('/profil'))
    expect(guide()).toBeNull()
    expect(window.sessionStorage.getItem(DEMO_GUIDE_SEEN_KEY)).toBe('1')
  })

  test('schon gesehen in dieser Sitzung: bleibt zu', async () => {
    window.sessionStorage.setItem(DEMO_GUIDE_SEEN_KEY, '1')
    await render()
    expect(guide()).toBeNull()
  })

  test('schließen speichert den Merker in localStorage', async () => {
    await render()
    await act(async () => container.querySelector('button[aria-label="Hinweis schließen"]').click())

    expect(guide()).toBeNull()
    expect(window.localStorage.getItem(`chronik.${DEMO_GUIDE_SETTING}`)).toBe('true')
  })

  test('keine eigene Überschrift vor der h1 der Seite; nach dem Schließen steht der Fokus auf dieser h1', async () => {
    await render()
    expect(container.querySelector('.demo-guide h1, .demo-guide h2, .demo-guide h3')).toBeNull()
    const close = container.querySelector('.demo-guide-close')
    close.focus()

    await act(async () => close.click())

    const heading = container.querySelector('h1')
    expect(document.activeElement).toBe(heading)
    expect(heading.getAttribute('tabindex')).toBe('-1')
  })

  test('mit gespeichertem Merker bleibt er zu', async () => {
    window.localStorage.setItem(`chronik.${DEMO_GUIDE_SETTING}`, 'true')
    await render()
    expect(guide()).toBeNull()
  })

  test('ohne nutzbaren Speicher (privates Fenster): erscheint trotzdem und lässt sich schließen', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    await render()
    expect(container.querySelector('.demo-guide-title').textContent.trim()).toBe('Das ist die Demo eines Partner-Bereichs')

    await act(async () => container.querySelector('.demo-guide-close').click())
    expect(guide()).toBeNull()
  })

  // Rundgang: nur eines von beiden - Frage oder Rundgang verdrängen den Hinweis, danach steht er (einmal) da.
  test('offene Rundgang-Frage verdrängt den Hinweis; nach dem Schließen der Frage steht er da', async () => {
    await mount(
      '/profil',
      <TourProvider family={DEMO_PARTNER} autoPrompt>
        <Page />
      </TourProvider>
    )
    expect(tourPrompt()).not.toBeNull()
    expect(guide()).toBeNull()

    await act(async () => tourPrompt().querySelector('.tour-prompt-close').click())
    expect(tourPrompt()).toBeNull()
    expect(guide()).not.toBeNull()
  })

  test('während des Rundgangs verdrängt - auch Seitenwechsel zählen nicht als gesehen', async () => {
    let setBusy
    function Busy({ children }) {
      const [busy, set] = useState(true)
      setBusy = set
      return <TourBusyContext.Provider value={busy}>{children}</TourBusyContext.Provider>
    }
    await mount(
      '/profil',
      <Busy>
        <Page />
      </Busy>
    )
    expect(guide()).toBeNull()

    await act(async () => navigate('/kalender'))
    await act(async () => navigate('/profil'))
    expect(guide()).toBeNull()

    await act(async () => setBusy(false))
    expect(guide()).not.toBeNull()
    expect(window.sessionStorage.getItem(DEMO_GUIDE_SEEN_KEY)).toBeNull()
  })
})
