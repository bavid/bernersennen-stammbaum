// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { publicPartner, publicPartnerAnimals, publicHappyEnds, publicPartnerPosts } = vi.hoisted(() => ({
  publicPartner: vi.fn(),
  publicPartnerAnimals: vi.fn(),
  publicHappyEnds: vi.fn(),
  publicPartnerPosts: vi.fn()
}))
vi.mock('../api', () => ({ api: { publicPartner, publicPartnerAnimals, publicHappyEnds, publicPartnerPosts } }))

import PartnerPortalPage from './PartnerPortalPage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom kennt weder scrollIntoView noch <dialog> vollständig - beides für die Sprünge und "Schreib uns" ergänzt.
const scrollIntoView = vi.fn()
window.HTMLElement.prototype.scrollIntoView = scrollIntoView
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open')
  }
}

function scrolledIds() {
  return scrollIntoView.mock.contexts.map((el) => el.id)
}

let container
let root
let location
let navigate

// Fiktive Partner - Termine weit in der Zukunft, damit sie unabhängig vom Testdatum "kommend" sind.
const termine = [
  { terminId: 1, datum: '2099-03-07', uhrzeit: '10:00', ende: '11:00', titel: 'Welpenspielstunde', ort: 'Wiese am Deich', serie: 'woechentlich' },
  { terminId: 1, datum: '2099-03-14', uhrzeit: '10:00', ende: '11:00', titel: 'Welpenspielstunde', ort: 'Wiese am Deich', serie: 'woechentlich', abgesagt: true },
  { terminId: 2, datum: '2099-03-15', uhrzeit: '11:00', ende: null, titel: 'Social Walk', ort: null, serie: 'keine' },
  { terminId: 1, datum: '2099-03-21', uhrzeit: '10:00', ende: '11:00', titel: 'Welpenspielstunde', ort: 'Wiese am Deich', serie: 'woechentlich' },
  { terminId: 3, datum: '2099-03-28', uhrzeit: '18:00', ende: '20:00', titel: 'Erste Hilfe am Hund', ort: 'Seminarraum', serie: 'keine' }
]

const school = {
  id: 4,
  slug: 'hundeschule-wiesengrund',
  name: 'Hundeschule Wiesengrund',
  typ: 'hundeschule',
  ort: 'Hamburg',
  website: 'https://wiesengrund.example.org',
  kontakt_email: null,
  kontakt_telefon: '040 1234567',
  logoUrl: null,
  portal_titel: 'Gemeinsam lernen',
  portal_text: 'Kurse für jedes Alter.\n\nVom Welpen bis zum Senior.',
  ansprechperson: 'Mara Lind',
  farbe: null,
  einblicke: [],
  termine
}

const shelter = {
  ...school,
  id: 1,
  slug: 'tierheim-sonnenhang',
  name: 'Tierheim Sonnenhang',
  typ: 'tierheim',
  vermittlung_url: 'https://sonnenhang.example.org/vermittlung',
  termine: [],
  einblicke: [{ id: 2, fotoUrl: '/public-media/22222222-2222-2222-2222-222222222222.jpg', datum: '2099-01-01', text: 'Sommerfest' }]
}

const post = (id, titel) => ({ id, kind: 'promotion', kennzeichnung: 'Anzeige', titel, text: `${titel} – mehr dazu`, bildUrl: null, clickUrl: `/r/promotion/${id}` })
const posts = [post(1, 'Welpenkurs'), post(2, 'Einzeltraining'), post(3, 'Agility')]
const animal = (slug, name) => ({ slug, name, tierart: 'hund', geschlecht: 'ruede', rasse: null, geburtsdatum: null, fotoUrl: null, vermittlung_status: 'in_vermittlung' })

function Probe() {
  location = useLocation()
  navigate = useNavigate()
  return null
}

beforeEach(() => {
  publicPartnerAnimals.mockResolvedValue([])
  publicHappyEnds.mockResolvedValue([])
  publicPartnerPosts.mockResolvedValue(posts)
  publicPartner.mockResolvedValue(school)
})

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
  for (const mock of [publicPartner, publicPartnerAnimals, publicHappyEnds, publicPartnerPosts]) mock.mockReset()
  scrollIntoView.mockClear()
})

async function render(path = '/p/hundeschule-wiesengrund', slug = 'hundeschule-wiesengrund') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={Array.isArray(path) ? path : [path]} initialIndex={Array.isArray(path) ? path.length - 1 : 0}>
        <ThemeProvider themeId="standard">
          <PartnerPortalPage slug={slug} family={null} onRedeemed={() => {}} onLogout={() => {}} />
          <Probe />
        </ThemeProvider>
      </MemoryRouter>
    )
  )
}

function tabs() {
  return [...container.querySelectorAll('[role="tab"]')]
}

function tabLabels() {
  return tabs().map((tab) => tab.firstChild.textContent)
}

function tab(label) {
  return tabs().find((item) => item.firstChild.textContent === label)
}

function selectedLabel() {
  return tabs().find((item) => item.getAttribute('aria-selected') === 'true').firstChild.textContent
}

function visiblePanel() {
  const shown = [...container.querySelectorAll('[role="tabpanel"]')].filter((panel) => !panel.hidden)
  expect(shown).toHaveLength(1)
  return shown[0]
}

function button(text, scope = container) {
  return [...scope.querySelectorAll('button')].find((btn) => btn.textContent.trim() === text)
}

describe('Portal-Reiter – Leiste', () => {
  test('Hundeschule: Übersicht, Angebote, Termine, Kontakt mit Zählern - Einblicke und Tiere fehlen ohne Inhalt', async () => {
    await render()

    expect(container.querySelector('[role="tablist"]').getAttribute('aria-label')).toBe('Bereiche von Hundeschule Wiesengrund')
    expect(tabLabels()).toEqual(['Übersicht', 'Angebote', 'Termine', 'Kontakt'])
    expect(tab('Angebote').querySelector('.tab-bar-count').textContent).toBe('3')
    // Eine Serie zählt einmal: Welpenspielstunde, Social Walk, Erste Hilfe.
    // Feedback-Runde: der Zähler nennt die Tage, die der Reiter zeigt (jede Woche der Serie, ohne den abgesagten).
    expect(tab('Termine').querySelector('.tab-bar-count').textContent).toBe('4')
    expect(tab('Termine').querySelector('.visually-hidden').textContent).toBe(' (4 Termine)')
    expect(container.querySelectorAll('#partner-portal-termine .portal-termin:not(.is-cancelled)')).toHaveLength(4)
    expect(tab('Übersicht').querySelector('.tab-bar-count')).toBeNull()
    expect(selectedLabel()).toBe('Übersicht')
  })

  test('Tierheim: Tiere gleich nach der Übersicht, Happy Ends im selben Reiter, die Vermittlungsseite dort statt im Kopf', async () => {
    publicPartner.mockResolvedValue(shelter)
    publicPartnerAnimals.mockResolvedValue([animal('lotte-ab12', 'Lotte'), animal('oskar-cd34', 'Oskar')])
    publicHappyEnds.mockResolvedValue([{ name: 'Nele', tierart: 'hund', fotoUrl: null, entry: { titel: 'Angekommen', datum: '2099-01-02', text: 'Gut.', fotoUrl: null } }])
    publicPartnerPosts.mockResolvedValue([])
    await render('/p/tierheim-sonnenhang', 'tierheim-sonnenhang')

    expect(tabLabels()).toEqual(['Übersicht', 'Tiere', 'Einblicke', 'Kontakt'])
    expect(tab('Tiere').querySelector('.tab-bar-count').textContent).toBe('2')
    await act(async () => tab('Tiere').click())
    const titles = [...visiblePanel().querySelectorAll('.portal-section h2')].map((h) => h.textContent)
    expect(titles).toEqual(['Fellnasen suchen ein Zuhause', 'Happy Ends'])
    expect(visiblePanel().textContent).toContain('Alle Tiere auf der Vermittlungsseite')
    expect(container.querySelector('.partner-portal-hero').textContent).not.toContain('Tiere in Vermittlung')
  })

  test('alle Reiter stehen im Dokument, nur der gewählte ist sichtbar - ohne neue Anfragen beim Wechsel', async () => {
    await render()
    expect(container.querySelectorAll('[role="tabpanel"]')).toHaveLength(4)
    expect(visiblePanel().id).toBe('portal-panel-uebersicht')
    expect(container.querySelector('#partner-portal-termine').closest('[role="tabpanel"]').hidden).toBe(true)

    await act(async () => tab('Termine').click())

    expect(visiblePanel().id).toBe('portal-panel-termine')
    expect(tab('Termine').getAttribute('aria-controls')).toBe('portal-panel-termine')
    expect(visiblePanel().getAttribute('aria-labelledby')).toBe('portal-tab-termine')
    expect(publicPartner).toHaveBeenCalledTimes(1)
    expect(publicPartnerPosts).toHaveBeenCalledTimes(1)
    expect(publicPartnerAnimals).toHaveBeenCalledTimes(1)
  })
})

describe('Portal-Reiter – Adresse', () => {
  test('?reiter=termine öffnet den Reiter Termine', async () => {
    await render('/p/hundeschule-wiesengrund?reiter=termine')
    expect(selectedLabel()).toBe('Termine')
    expect(visiblePanel().querySelector('h2').textContent).toBe('Termine')
  })

  test.each([['quatsch'], ['tiere'], ['einblicke'], ['']])('?reiter=%s (unbekannt oder leer) zeigt die Übersicht', async (value) => {
    await render(`/p/hundeschule-wiesengrund?reiter=${value}`)
    expect(selectedLabel()).toBe('Übersicht')
  })

  test('ein Wechsel schreibt den Reiter in die Adresse (?demo=1 bleibt) - Zurück führt zum vorigen Reiter', async () => {
    await render('/p/hundeschule-wiesengrund?demo=1')

    await act(async () => tab('Angebote').click())
    expect(location.search).toBe('?demo=1&reiter=angebote')
    await act(async () => tab('Kontakt').click())
    expect(location.search).toBe('?demo=1&reiter=kontakt')
    await act(async () => tab('Übersicht').click())
    expect(location.search).toBe('?demo=1')

    await act(async () => navigate(-1))
    expect(selectedLabel()).toBe('Kontakt')
    await act(async () => navigate(-1))
    expect(selectedLabel()).toBe('Angebote')
    // ?demo=1 geht weiter mit, die Listen wurden nicht neu geladen.
    expect(publicPartnerPosts).toHaveBeenCalledTimes(1)
    expect(publicPartnerPosts).toHaveBeenCalledWith('hundeschule-wiesengrund', { demo: '1' })
  })

  test('mit den Pfeiltasten durch die Leiste: ein Eintrag im Verlauf für den ganzen Weg', async () => {
    await render(['/partner', '/p/hundeschule-wiesengrund'])
    const press = (key) => act(async () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })))
    tab('Übersicht').focus()
    await press('ArrowRight')
    await press('ArrowRight')
    await press('End')
    expect(selectedLabel()).toBe('Kontakt')
    expect(document.activeElement).toBe(tab('Kontakt'))
    expect(location.search).toBe('?reiter=kontakt')

    // Der erste Schritt legt einen Eintrag an, die weiteren ersetzen ihn: einmal Zurück -> Übersicht, noch einmal -> raus.
    await act(async () => navigate(-1))
    expect(location.pathname).toBe('/p/hundeschule-wiesengrund')
    expect(selectedLabel()).toBe('Übersicht')
    await act(async () => navigate(-1))
    expect(location.pathname).toBe('/partner')
  })

  test('ein ungültiger Wert fällt beim Klick auf "Übersicht" ohne neuen Eintrag weg', async () => {
    await render(['/partner', '/p/hundeschule-wiesengrund?reiter=quatsch'])
    await act(async () => tab('Übersicht').click())
    expect(location.search).toBe('')
    await act(async () => navigate(-1))
    expect(location.pathname).toBe('/partner')
  })

  test('derselbe Reiter noch einmal legt keinen neuen Eintrag an', async () => {
    await render('/p/hundeschule-wiesengrund?reiter=termine')
    const before = location.key
    await act(async () => tab('Termine').click())
    expect(location.key).toBe(before)
  })
})

describe('Portal-Reiter – alte Sprungmarken', () => {
  test.each([
    ['#kontakt', 'Kontakt', 'partner-portal-contact'],
    ['#partner-portal-contact', 'Kontakt', 'partner-portal-contact'],
    ['#gutschein', 'Kontakt', 'partner-portal-gutschein'],
    ['#partner-portal-termine', 'Termine', 'partner-portal-termine'],
    ['#angebote', 'Angebote', 'partner-portal-posts']
  ])('%s öffnet "%s" und springt zum Abschnitt', async (hash, label, target) => {
    await render(`/p/hundeschule-wiesengrund${hash}`)
    expect(selectedLabel()).toBe(label)
    expect(scrolledIds()).toContain(target)
    expect(document.activeElement.id).toBe(`${target}-title`)
  })

  test('eine Sprungmarke auf einen leeren Reiter (#tiere bei einer Hundeschule) zeigt die Übersicht', async () => {
    await render('/p/hundeschule-wiesengrund#tiere')
    expect(selectedLabel()).toBe('Übersicht')
  })

  test('die Sprungmarke wirkt nur einmal beim Öffnen - nicht wieder nach Reiterwechseln', async () => {
    await render('/p/hundeschule-wiesengrund#kontakt')
    expect(scrolledIds()).toEqual(['partner-portal-contact'])
    await act(async () => tab('Termine').click())
    await act(async () => navigate(-1))
    expect(selectedLabel()).toBe('Kontakt')
    expect(scrolledIds()).toEqual(['partner-portal-contact'])
  })

  test('?reiter= gewinnt über die Sprungmarke; der nächste Wechsel lässt die Sprungmarke fallen', async () => {
    await render('/p/hundeschule-wiesengrund?reiter=angebote#kontakt')
    expect(selectedLabel()).toBe('Angebote')
    await act(async () => tab('Termine').click())
    expect(location.hash).toBe('')
    expect(location.search).toBe('?reiter=termine')
  })
})

describe('Portal-Reiter – Kopf', () => {
  test('Kopf: Name, Unterzeile und die Hauptaktionen - der Willkommenstext steht in der Übersicht', async () => {
    await render()
    const hero = container.querySelector('.partner-portal-hero')
    expect(hero.querySelector('h1').textContent).toBe('Hundeschule Wiesengrund')
    expect(hero.querySelector('.partner-portal-tagline').textContent).toBe('Gemeinsam lernen')
    expect(hero.querySelector('.partner-portal-text')).toBeNull()
    expect([...hero.querySelectorAll('button')].map((btn) => btn.textContent.trim())).toEqual(['Kontakt', 'Gutschein einlösen'])
  })

  test('mit Kontaktformular öffnet "Schreib uns" im Kopf das Formular direkt', async () => {
    publicPartner.mockResolvedValue({ ...school, kontaktformular: true })
    await render()
    const hero = container.querySelector('.partner-portal-hero')
    expect(button('Kontakt', hero)).toBeUndefined()
    await act(async () => button('Schreib uns', hero).click())
    expect(document.querySelector('dialog[open]').textContent).toContain('Nachricht an Hundeschule Wiesengrund')
    expect(selectedLabel()).toBe('Übersicht')
  })

  test('Zurück im Browser bei offenem "Schreib uns" im Reiter Kontakt: der Dialog schließt mit dem Reiter', async () => {
    publicPartner.mockResolvedValue({ ...school, kontaktformular: true })
    await render(['/p/hundeschule-wiesengrund', '/p/hundeschule-wiesengrund?reiter=kontakt'])
    await act(async () => button('Schreib uns', visiblePanel()).click())
    expect(document.querySelector('dialog[open]')).not.toBeNull()

    await act(async () => navigate(-1))

    expect(selectedLabel()).toBe('Übersicht')
    expect(document.querySelector('dialog[open]')).toBeNull()
  })

  test('"Gutschein einlösen" im Kopf öffnet den Reiter Kontakt und setzt den Fokus auf "Gutschein einlösen"', async () => {
    await render()
    await act(async () => button('Gutschein einlösen', container.querySelector('.partner-portal-hero')).click())
    expect(selectedLabel()).toBe('Kontakt')
    expect(location.search).toBe('?reiter=kontakt')
    expect(scrolledIds()).toContain('partner-portal-gutschein')
    expect(document.activeElement.id).toBe('partner-portal-gutschein-title')
    expect(visiblePanel().querySelector('#redeem-code')).not.toBeNull()
  })
})

describe('Portal-Reiter – Übersicht', () => {
  test('Willkommenstext, die zwei ersten Angebote, die nächsten drei Termine (ohne abgesagte) und eine Kontaktzeile', async () => {
    await render()
    const panel = visiblePanel()

    expect([...panel.querySelectorAll('.partner-portal-text')].map((p) => p.textContent)).toEqual(['Kurse für jedes Alter.', 'Vom Welpen bis zum Senior.'])
    expect([...panel.querySelectorAll('.portal-overview-post h3')].map((h) => h.textContent)).toEqual(['Welpenkurs', 'Einzeltraining'])
    // Kompakt: kein externer Link in der Übersicht.
    expect(panel.querySelectorAll('.portal-overview-post a')).toHaveLength(0)
    const termine = [...panel.querySelectorAll('.portal-overview-termin')]
    expect(termine.map((row) => row.querySelector('.portal-overview-termin-title').textContent)).toEqual(['Welpenspielstunde', 'Social Walk', 'Welpenspielstunde'])
    expect(termine[0].querySelector('time').getAttribute('dateTime')).toBe('2099-03-07')
    expect(termine[0].querySelector('.portal-overview-termin-meta').textContent).toBe('10:00–11:00 Uhr · Wiese am Deich')
    const contact = panel.querySelector('.portal-overview-contact')
    expect(contact.textContent).toContain('Ansprechperson: Mara Lind')
    expect(contact.querySelector('a[href^="tel:"]')).not.toBeNull()
  })

  test('"Alle 4 Termine" (so viele wie am Reiter) wechselt zum Reiter Termine und setzt den Fokus auf den Reiter', async () => {
    await render()
    await act(async () => button('Alle 4 Termine').click())
    expect(selectedLabel()).toBe('Termine')
    expect(document.activeElement).toBe(tab('Termine'))
    await act(async () => tab('Übersicht').click())
    await act(async () => button('Alle 3 Angebote').click())
    expect(selectedLabel()).toBe('Angebote')
    expect(visiblePanel().querySelectorAll('.promotion-card')).toHaveLength(3)
  })

  test('Tierheim: eine kleine Tier-Vorschau mit Links zu den Steckbriefen und "Alle … Tiere ansehen"', async () => {
    publicPartner.mockResolvedValue(shelter)
    const animals = ['a', 'b', 'c', 'd', 'e'].map((key) => animal(`${key}-1234`, `Tier ${key.toUpperCase()}`))
    publicPartnerAnimals.mockResolvedValue(animals)
    await render('/p/tierheim-sonnenhang', 'tierheim-sonnenhang')

    const strip = visiblePanel().querySelectorAll('.portal-overview-animal')
    expect([...strip].map((link) => link.getAttribute('href'))).toEqual(['/t/a-1234', '/t/b-1234', '/t/c-1234', '/t/d-1234'])
    await act(async () => button('Alle 5 Tiere ansehen').click())
    expect(selectedLabel()).toBe('Tiere')
  })

  test('ohne Text, Angebote, Termine und Kontakt ein ruhiger Hinweis statt einer leeren Übersicht', async () => {
    publicPartner.mockResolvedValue({ ...school, portal_text: '', termine: [], website: null, kontakt_telefon: null })
    publicPartnerPosts.mockResolvedValue([])
    await render()
    expect(visiblePanel().textContent).toBe('Mehr über Hundeschule Wiesengrund steht in den Reitern oben.')
  })
})

describe('Portal-Reiter – Laden', () => {
  test('die Reiter erscheinen erst, wenn auch die Listen da sind - Zähler springen nicht nach', async () => {
    let resolvePosts
    publicPartnerPosts.mockReturnValue(new Promise((resolve) => (resolvePosts = resolve)))
    await render('/p/hundeschule-wiesengrund?reiter=angebote')
    expect(container.querySelector('[role="tablist"]')).toBeNull()
    expect(container.querySelector('.splash')).not.toBeNull()

    await act(async () => resolvePosts(posts))
    expect(selectedLabel()).toBe('Angebote')
  })

  test('hängt eine Liste, erscheint das Portal nach kurzer Wartezeit ohne sie - kommt sie später, füllt sie nach', async () => {
    vi.useFakeTimers()
    try {
      let resolvePosts
      publicPartnerPosts.mockReturnValue(new Promise((resolve) => (resolvePosts = resolve)))
      await render()
      expect(container.querySelector('[role="tablist"]')).toBeNull()

      await act(async () => vi.advanceTimersByTime(4000))
      expect(tabLabels()).toEqual(['Übersicht', 'Termine', 'Kontakt'])

      await act(async () => resolvePosts(posts))
      expect(tabLabels()).toEqual(['Übersicht', 'Angebote', 'Termine', 'Kontakt'])
    } finally {
      vi.useRealTimers()
    }
  })

  test('schlägt eine Liste fehl, bleibt das Portal mit den übrigen Reitern', async () => {
    publicPartnerPosts.mockRejectedValue(new Error('Fehler 500'))
    await render()
    expect(tabLabels()).toEqual(['Übersicht', 'Termine', 'Kontakt'])
  })
})
