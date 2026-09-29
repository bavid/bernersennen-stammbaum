// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
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

let container
let root

// Fiktiver Partner mit allem, was ein Portal zeigen kann.
const partner = {
  id: 7,
  slug: 'tierheim-lindenhof',
  name: 'Tierheim Lindenhof',
  typ: 'tierheim',
  plz: '28195',
  ort: 'Bremen',
  lat: null,
  lon: null,
  website: 'https://lindenhof.example.org',
  kontakt_email: null,
  kontakt_telefon: null,
  logoUrl: null,
  badge: 'partner',
  portal_titel: null,
  portal_text: 'Wir vermitteln Hunde und Katzen.',
  spenden_url: null,
  vermittlung_url: null,
  farbe: null,
  einblicke: [{ id: 1, fotoUrl: '/public-media/11111111-1111-1111-1111-111111111111.jpg', datum: '2026-09-01', text: 'Sommerfest' }]
}

const animal = {
  slug: 'flocke-ab12',
  name: 'Flocke',
  tierart: 'katze',
  geschlecht: 'weiblich',
  rasse: null,
  geburtsdatum: null,
  fotoUrl: null,
  vermittlung_status: 'in_vermittlung'
}

const happyEnd = { name: 'Wilma', tierart: 'hund', fotoUrl: null, entry: { titel: 'Angekommen', datum: '2026-05-01', text: 'Alles gut.', fotoUrl: null } }

const post = {
  id: 3,
  kind: 'promotion',
  bereich: 'begleiter',
  kennzeichnung: 'Anzeige',
  empfohlenVon: null,
  titel: 'Patenschaft für Senioren',
  text: 'Monatlich helfen.',
  bildUrl: null,
  tierart: null,
  url: 'https://lindenhof.example.org/pate',
  clickUrl: '/r/promotion/3'
}

beforeEach(() => {
  publicPartnerAnimals.mockResolvedValue([animal])
  publicHappyEnds.mockResolvedValue([happyEnd])
  publicPartnerPosts.mockResolvedValue([post])
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
})

async function render(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={['/p/tierheim-lindenhof']}>
        <ThemeProvider themeId="standard">
          <PartnerPortalPage slug="tierheim-lindenhof" family={null} onRedeemed={() => {}} onLogout={() => {}} {...props} />
        </ThemeProvider>
      </MemoryRouter>
    )
  )
}

function sectionTitles() {
  return [...container.querySelectorAll('.portal-section h2')].map((h) => h.textContent)
}

function button(text) {
  return [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim() === text)
}

describe('PartnerPortalPage – Landingpage (Phase U)', () => {
  test('Abschnitte in fester Reihenfolge: Angebote, Einblicke, Tiere, Happy Ends, Kontakt, Gutschein', async () => {
    publicPartner.mockResolvedValue(partner)
    await render()
    expect(sectionTitles()).toEqual([
      'Angebote & Aktuelles',
      'Einblicke',
      'Fellnasen suchen ein Zuhause',
      'Happy Ends',
      'Kontakt',
      'Gutschein einlösen'
    ])
  })

  test('"Kontakt" im Kopf springt zum Kontakt-Abschnitt und setzt den Fokus auf dessen Überschrift', async () => {
    publicPartner.mockResolvedValue(partner)
    await render()
    const heading = container.querySelector('#partner-portal-contact-title')
    heading.scrollIntoView = vi.fn()
    const target = container.querySelector('#partner-portal-contact')
    target.scrollIntoView = vi.fn()

    await act(async () => button('Kontakt').click())

    expect(target.scrollIntoView).toHaveBeenCalled()
    expect(document.activeElement).toBe(heading)
  })

  test('ohne jeden Kontaktweg: kein Kontakt-Abschnitt und kein Kopf-Knopf', async () => {
    publicPartner.mockResolvedValue({ ...partner, website: null })
    await render()
    expect(button('Kontakt')).toBeUndefined()
    expect(sectionTitles()).not.toContain('Kontakt')
  })

  test('der dezente Fuß führt zur Startseite und zum Gutschein-Anfragen', async () => {
    publicPartner.mockResolvedValue(partner)
    await render()
    const strip = container.querySelector('.portal-brand-strip')
    expect(strip.textContent).toContain('Mit Familie auf Pfoten – eine Chronik für deine Tiere')
    const links = [...strip.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')])
    expect(links).toEqual([
      ['Mehr erfahren', '/'],
      ['Gutschein anfragen', '/#gutschein-anfragen']
    ])
  })

  test('keine fremden Anzeigen: das Portal fragt nur die Beiträge dieses Partners ab', async () => {
    publicPartner.mockResolvedValue(partner)
    await render()
    expect(publicPartnerPosts).toHaveBeenCalledTimes(1)
    expect(publicPartnerPosts).toHaveBeenCalledWith('tierheim-lindenhof', { demo: undefined })
    expect(container.querySelectorAll('.promotion-card')).toHaveLength(1)
    expect(container.querySelector('.promotion-badge')).toBeNull()
  })

  test('Kundensicht: der Fuß ist sichtbar, seine Links sind deaktiviert', async () => {
    const load = vi.fn().mockResolvedValue({ ...partner, tiere: [], posts: [] })
    await render({ slug: undefined, load, preview: true })
    const strip = container.querySelector('.portal-brand-strip')
    expect(strip.querySelectorAll('a')).toHaveLength(0)
    expect([...strip.querySelectorAll('[aria-disabled="true"]')].map((el) => el.textContent)).toEqual(['Mehr erfahren', 'Gutschein anfragen'])
  })
})
