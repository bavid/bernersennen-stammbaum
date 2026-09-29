// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { discover } = vi.hoisted(() => ({ discover: vi.fn() }))
vi.mock('../api', () => ({ api: { discover } }))

import DiscoverPage from './DiscoverPage.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

beforeEach(() => {
  window.localStorage.clear()
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
  discover.mockReset()
  window.localStorage.clear()
})

async function render(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <DiscoverPage {...props} />
      </MemoryRouter>
    )
  )
  return container
}

function section(titleText) {
  return [...container.querySelectorAll('section[aria-labelledby]')].find(
    (el) => document.getElementById(el.getAttribute('aria-labelledby'))?.textContent === titleText
  )
}

function salonPartner(overrides) {
  return {
    id: 11,
    kind: 'partner',
    slug: 'hundesalon-flocke',
    name: 'Hundesalon Flocke',
    typ: 'hundesalon',
    plz: '20095',
    ort: 'Hamburg',
    lat: null,
    lon: null,
    logoUrl: null,
    badge: 'partner',
    url: null,
    clickUrl: null,
    ...overrides
  }
}

function salonPromotion(overrides) {
  return {
    id: 50,
    kind: 'promotion',
    bereich: 'salon',
    kennzeichnung: 'Anzeige',
    empfohlenVon: null,
    titel: 'Herbst-Pflegetag',
    text: 'Baden, Bürsten, Krallen schneiden.',
    bildUrl: null,
    tierart: 'hund',
    url: 'https://example.org/pflegetag',
    clickUrl: '/r/promotion/50',
    ...overrides
  }
}

function response(overrides) {
  return {
    fallback: { hundeschulen: false, salon: false, begleiter: false },
    hundeschulen: [],
    salon: [],
    begleiter: { partner: [], tiere: [], promotions: [] },
    futter: [],
    unterstuetzen: { gofundmeUrl: null, gofundmeClickUrl: null, text: null, bericht: null, partnerSpenden: [], promotions: [] },
    ...overrides
  }
}

describe('DiscoverPage – Kapitel "Salon & Betreuung" (Phase P2)', () => {
  test('steht direkt nach "Hundeschule gesucht?", mit Salons, Betreuung und Anzeigen (rel="sponsored")', async () => {
    discover.mockResolvedValue(
      response({
        salon: [salonPartner(), salonPartner({ id: 12, slug: 'pension-wilma', name: 'Pension Wilma', typ: 'betreuung' }), salonPromotion()]
      })
    )
    await render()

    const titles = [...container.querySelectorAll('section[aria-labelledby] h2')].map((h) => h.textContent)
    expect(titles.slice(0, 2)).toEqual(['Hundeschule gesucht?', 'Salon & Betreuung'])

    const el = section('Salon & Betreuung')
    expect(el.querySelector('.discover-chapter-number').textContent).toBe('02')
    expect([...el.querySelectorAll('.partner-card h3')].map((h) => h.textContent)).toEqual(['Hundesalon Flocke', 'Pension Wilma'])
    const card = el.querySelector('.promotion-card')
    expect(card.querySelector('.promotion-badge').textContent).toBe('Anzeige')
    expect(card.querySelector('a').getAttribute('rel')).toBe('sponsored noopener noreferrer')
  })

  test('ohne Einträge: freundlicher Hinweis mit Link zur Partnerliste', async () => {
    discover.mockResolvedValue(response())
    await render()

    const el = section('Salon & Betreuung')
    expect(el.textContent).toContain('Noch keine Hundesalons oder Betreuung in der Nähe')
    expect(el.querySelector('a').getAttribute('href')).toBe('/partner')
  })

  test('Umkreis-Fallback: Hinweis und die weiter entfernten unter "Weiter weg"', async () => {
    discover.mockResolvedValue(
      response({
        fallback: { hundeschulen: false, salon: true, begleiter: false },
        salon: [
          salonPartner({ distanceKm: 3.2, ausserhalb: false }),
          salonPartner({ id: 13, slug: 'hundesitter-pepper', name: 'Hundesitter Pepper', typ: 'betreuung', distanceKm: 41.5, ausserhalb: true })
        ]
      })
    )
    await render()

    const el = section('Salon & Betreuung')
    expect(el.querySelector('.discover-fallback-note').textContent).toContain('In eurer Nähe gibt es nur wenige – hier die nächsten weiteren.')
    const far = el.querySelector('.discover-far')
    expect(far.querySelector('h3').textContent).toBe('Weiter weg')
    expect(far.textContent).toContain('Hundesitter Pepper')
    expect(far.textContent).not.toContain('Hundesalon Flocke')
  })

  test('Kundensicht: ein eigener, noch nicht freigegebener Beitrag trägt "Wartet auf Freigabe" und keinen Link', async () => {
    const load = vi.fn().mockResolvedValue(
      response({
        salon: [
          salonPromotion({ id: 60, titel: 'Tag der offenen Tür', vorschau: true, freigabe: 'eingereicht', clickUrl: null }),
          salonPromotion({ id: 61, titel: 'Welpen-Pflegestunde', vorschau: true, freigabe: 'freigegeben', clickUrl: '/r/promotion/61' })
        ]
      })
    )
    await render({ load, preview: true })

    const cards = [...section('Salon & Betreuung').querySelectorAll('.promotion-card')]
    const pending = cards.find((card) => card.textContent.includes('Tag der offenen Tür'))
    const approved = cards.find((card) => card.textContent.includes('Welpen-Pflegestunde'))
    expect(pending.querySelector('.promotion-badge-pending').textContent).toBe('Wartet auf Freigabe')
    expect(pending.querySelector('a, [role="link"]')).toBeNull()
    expect(approved.querySelector('.promotion-badge-pending')).toBeNull()
    expect(approved.querySelector('.promotion-badge').textContent).toBe('Anzeige')
  })

  test('öffentlich (ohne Kundensicht) erscheint nie "Wartet auf Freigabe"', async () => {
    discover.mockResolvedValue(response({ salon: [salonPromotion({ vorschau: true, freigabe: 'eingereicht' })] }))
    await render()
    expect(container.querySelector('.promotion-badge-pending')).toBeNull()
  })
})
