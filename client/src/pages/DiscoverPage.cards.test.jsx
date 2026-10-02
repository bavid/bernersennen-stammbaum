// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { discover } = vi.hoisted(() => ({ discover: vi.fn() }))
vi.mock('../api', () => ({ api: { discover } }))

import DiscoverPage from './DiscoverPage.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Phase V1: ein Partner = eine Karte (Anzeigen und Einblicke auf der Karte, Zähler zählen Partner).

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

async function render(path = '/entdecken') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <DiscoverPage />
      </MemoryRouter>
    )
  )
}

function anzeige(id, titel) {
  return { id, kind: 'promotion', bereich: 'hundeschule', kennzeichnung: 'Anzeige', titel, text: `${titel} – kurz erklärt.`, clickUrl: `/r/promotion/${id}` }
}

const pfotenglueck = {
  id: 1,
  kind: 'partner',
  slug: 'hundeschule-pfotenglueck',
  name: 'Hundeschule Pfotenglück',
  typ: 'hundeschule',
  plz: '20095',
  ort: 'Hamburg',
  badge: 'partner',
  kurztext: 'Welpenkurse und Hundetraining für Familien.',
  clickUrl: '/r/partner-website/1',
  anzeigen: [anzeige(11, 'Welpenkurs ab Oktober'), anzeige(12, 'Einzeltraining am Abend')],
  einblicke: [{ id: 5, fotoUrl: '/public-media/a.jpg', datum: '2026-08-22', text: 'Abschlussprüfung' }]
}

const response = {
  fallback: { hundeschulen: false, salon: false, begleiter: false },
  hundeschulen: [
    pfotenglueck,
    { id: 2, kind: 'partner', slug: 'hundeschule-birke', name: 'Hundeschule Birke', typ: 'hundeschule', badge: 'geprueft', anzeigen: [], einblicke: [] },
    { id: 30, kind: 'promotion', bereich: 'hundeschule', kennzeichnung: 'Empfehlung', empfohlenVon: 'Familie auf Pfoten', titel: 'Ratgeber Hundeschule', clickUrl: '/r/promotion/30' }
  ],
  begleiter: { partner: [], tiere: [], promotions: [] },
  futter: [],
  unterstuetzen: { partnerSpenden: [], promotions: [] }
}

const tabCount = (label) =>
  [...container.querySelectorAll('[role="tab"]')].find((tab) => tab.firstChild.textContent === label).querySelector('.tab-bar-count').textContent

describe('DiscoverPage – eine Karte je Partner', () => {
  test('die Anzeigen stehen auf der Karte des Partners, nur die Empfehlung ohne Partner ist eine eigene Karte', async () => {
    discover.mockResolvedValue(response)
    await render('/entdecken?bereich=hundeschulen')
    const cards = [...container.querySelectorAll('.partner-discover-card')]
    expect(cards.map((card) => card.querySelector('h3').textContent)).toEqual(['Hundeschule Pfotenglück', 'Hundeschule Birke'])
    expect([...cards[0].querySelectorAll('.partner-discover-ad-title')].map((el) => el.textContent)).toEqual(['Welpenkurs ab Oktober', 'Einzeltraining am Abend'])
    expect(cards[0].querySelector('.partner-discover-einblicke img').getAttribute('src')).toBe('/public-media/a.jpg')
    expect([...container.querySelectorAll('.promotion-card h3')].map((h) => h.textContent)).toEqual(['Ratgeber Hundeschule'])
    expect(cards[0].closest('li').classList.contains('has-anzeigen')).toBe(true)
    expect(cards[1].closest('li').classList.contains('has-anzeigen')).toBe(false)
  })

  test('der Zähler des Reiters zählt Karten (zwei Partner und eine Empfehlung), nicht die Anzeigen darauf', async () => {
    discover.mockResolvedValue(response)
    await render()
    expect(tabCount('Hundeschulen')).toBe('3')
  })
})
