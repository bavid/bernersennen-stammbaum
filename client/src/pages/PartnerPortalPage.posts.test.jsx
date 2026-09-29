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

const partner = {
  id: 4,
  slug: 'pfotenglueck',
  name: 'Hundeschule Pfotenglück',
  typ: 'hundeschule',
  plz: '20095',
  ort: 'Hamburg',
  lat: null,
  lon: null,
  website: null,
  kontakt_email: null,
  kontakt_telefon: null,
  logoUrl: null,
  badge: 'partner',
  portal_titel: null,
  portal_text: 'Kleine Gruppen, viel Geduld.',
  spenden_url: null,
  vermittlung_url: null,
  farbe: null,
  einblicke: []
}

function card(overrides) {
  return {
    id: 5,
    kind: 'promotion',
    bereich: 'hundeschule',
    kennzeichnung: 'Anzeige',
    empfohlenVon: null,
    titel: 'Welpenkurs ab Oktober',
    text: 'Sechs Termine, kleine Gruppen.',
    bildUrl: null,
    tierart: null,
    url: 'https://example.org/welpenkurs',
    clickUrl: '/r/promotion/5',
    ...overrides
  }
}

beforeEach(() => {
  publicPartnerAnimals.mockResolvedValue([])
  publicHappyEnds.mockResolvedValue([])
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

async function render(props = {}, path = '/p/pfotenglueck') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <ThemeProvider themeId="standard">
          <PartnerPortalPage slug="pfotenglueck" family={null} onRedeemed={() => {}} onLogout={() => {}} {...props} />
        </ThemeProvider>
      </MemoryRouter>
    )
  )
  return container
}

function postsSection() {
  return container.querySelector('.partner-portal-posts')
}

describe('PartnerPortalPage – "Angebote & Aktuelles" (Phase P2, Phase U)', () => {
  test('zeigt die freigegebenen eigenen Beiträge ohne "Anzeige"-Badge, der Link behält rel="sponsored"', async () => {
    publicPartner.mockResolvedValue(partner)
    publicPartnerPosts.mockResolvedValue([card(), card({ id: 6, titel: 'Tag der offenen Tür', url: null, clickUrl: null })])
    await render()

    expect(publicPartnerPosts).toHaveBeenCalledWith('pfotenglueck', { demo: undefined })
    const section = postsSection()
    expect(section.querySelector('h2').textContent).toBe('Angebote & Aktuelles')
    const cards = [...section.querySelectorAll('.promotion-card')]
    expect(cards).toHaveLength(2)
    // Es ist ihre eigene Seite: keine Kennzeichnung, auch nicht als Text.
    expect(section.querySelector('.promotion-badge')).toBeNull()
    expect(section.querySelector('.promotion-card-anzeige')).toBeNull()
    expect(section.textContent).not.toContain('Anzeige')
    const link = cards[0].querySelector('a')
    expect(link.getAttribute('href')).toBe('/r/promotion/5')
    expect(link.getAttribute('rel')).toBe('sponsored noopener noreferrer')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(cards[1].querySelector('a')).toBeNull()
    // Öffentlich nie "Wartet auf Freigabe".
    expect(section.querySelector('.promotion-badge-pending')).toBeNull()
  })

  test('mit ?demo=1 geht demo an die Beiträge-Anfrage', async () => {
    publicPartner.mockResolvedValue(partner)
    publicPartnerPosts.mockResolvedValue([])
    await render({}, '/p/pfotenglueck?demo=1')
    expect(publicPartnerPosts).toHaveBeenCalledWith('pfotenglueck', { demo: '1' })
  })

  test('ohne Beiträge (oder wenn das Laden scheitert) erscheint der Abschnitt nicht', async () => {
    publicPartner.mockResolvedValue(partner)
    publicPartnerPosts.mockRejectedValue(new Error('offline'))
    await render()
    expect(postsSection()).toBeNull()
    expect(container.querySelector('h1')).not.toBeNull()
  })

  test('Kundensicht: Beiträge aus der Vorschau-Antwort - noch nicht freigegebene mit "Wartet auf Freigabe" und ohne Link', async () => {
    const load = vi.fn().mockResolvedValue({
      ...partner,
      vorschau: true,
      tiere: [],
      posts: [
        card({ id: 7, titel: 'Tag der offenen Tür', vorschau: true, freigabe: 'eingereicht', clickUrl: null }),
        card({ id: 5, vorschau: true, freigabe: 'freigegeben' })
      ]
    })
    await render({ slug: undefined, load, preview: true })

    expect(publicPartnerPosts).not.toHaveBeenCalled()
    const [pending, approved] = [...postsSection().querySelectorAll('.promotion-card')]
    expect(pending.querySelector('.promotion-badge-pending').textContent).toBe('Wartet auf Freigabe')
    expect(pending.querySelector('a, [role="link"]')).toBeNull()
    expect(approved.querySelector('.promotion-badge-pending')).toBeNull()
    // In der Vorschau ist auch der Link eines freigegebenen Beitrags nur Text.
    expect(approved.querySelector('a')).toBeNull()
    expect(approved.querySelector('[role="link"][aria-disabled="true"]')).not.toBeNull()
  })
})
