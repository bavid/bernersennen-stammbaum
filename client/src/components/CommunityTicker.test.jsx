// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { community } = vi.hoisted(() => ({ community: vi.fn() }))
vi.mock('../api', () => ({ api: { community } }))

import CommunityTicker, { PHOTO_MS } from './CommunityTicker.jsx'
import { TICKER_LEER } from '../lib/community.js'

// Laufband „Zahlen aus der Gemeinschaft“: Bewegung, Anhalten, weniger Bewegung, Nullen und Fehler.
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const DATA = {
  familien: 10,
  zuhause: 4,
  erinnerungen: 200,
  fotos: 80,
  partner: 3,
  spendenCents: 50000,
  partnerVorgestellt: [
    { slug: 'hundeschule-pfotenglueck', name: 'Hundeschule Pfotenglück', typ: 'hundeschule', fotos: ['/public-media/1.jpg', '/public-media/2.jpg', '/public-media/3.jpg'] }
  ]
}
const ZERO = { familien: 0, zuhause: 0, erinnerungen: 0, fotos: 0, partner: 0, spendenCents: 0, partnerVorgestellt: [] }

let container
let root

function unmount() {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
}

afterEach(() => {
  unmount()
  community.mockReset()
  delete window.matchMedia
  vi.useRealTimers()
})

function mockReducedMotion() {
  window.matchMedia = (query) => ({ matches: query.includes('reduce'), addEventListener() {}, removeEventListener() {} })
}

async function render(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <CommunityTicker {...props} />
      </MemoryRouter>
    )
  )
}

const region = () => container.querySelector('[role="region"]')

describe('CommunityTicker', () => {
  test('läuft: Region mit Namen, Band aria-hidden mit doppeltem Inhalt, Satz einmal für Screenreader, Partner vorn als Link', async () => {
    community.mockResolvedValue(DATA)
    await render()
    expect(region().getAttribute('aria-label')).toBe('Zahlen aus der Gemeinschaft')
    expect(region().getAttribute('aria-live')).toBeNull()
    const viewport = container.querySelector('.community-ticker-viewport')
    expect(viewport.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelectorAll('.community-ticker-list')).toHaveLength(2)
    expect(container.querySelector('.community-ticker-track').style.getPropertyValue('--ticker-duration')).toMatch(/^\d+s$/)
    expect(container.querySelector('.visually-hidden').textContent).toMatch(
      /^Dabei sind 10 Familien, 4 Zuhause, 200 Erinnerungen, 80 Fotos, 500\s€ Spenden, 3 Partner\.$/
    )
    expect(viewport.querySelector('a')).toBeNull()
    // Der Partner des Monats steht fest vorn, außerhalb des laufenden Bands - immer per Tastatur erreichbar.
    const hero = container.querySelector('.community-hero')
    expect(hero.getAttribute('href')).toBe('/p/hundeschule-pfotenglueck')
    expect(hero.textContent).toContain('Partner des Monats')
    expect(hero.textContent).toContain('Hundeschule Pfotenglück')
    expect(hero.compareDocumentPosition(viewport) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  test('Fotos des Partners: erstes mit Namen als Alt-Text, blendet alle vier Sekunden zum nächsten (lädt nur bis zum nächsten)', async () => {
    vi.useFakeTimers()
    community.mockResolvedValue(DATA)
    await render()
    const photos = () => [...container.querySelectorAll('.community-hero-photo img')]
    expect(photos().map((img) => img.getAttribute('src'))).toEqual(['/public-media/1.jpg', '/public-media/2.jpg'])
    expect(photos()[0].getAttribute('alt')).toBe('Hundeschule Pfotenglück')
    expect(photos()[0].className).toBe('is-active')
    await act(async () => vi.advanceTimersByTime(PHOTO_MS))
    expect(photos()).toHaveLength(3)
    expect(photos()[1].className).toBe('is-active')
    expect(photos()[0].className).toBe('')
    await act(async () => vi.advanceTimersByTime(PHOTO_MS * 2))
    expect(photos()[0].className).toBe('is-active')
  })

  test('weniger Bewegung: nur das erste Foto, kein Wechsel; ohne Fotos ein Stern', async () => {
    vi.useFakeTimers()
    mockReducedMotion()
    community.mockResolvedValue(DATA)
    await render()
    await act(async () => vi.advanceTimersByTime(PHOTO_MS * 3))
    const photos = [...container.querySelectorAll('.community-hero-photo img')]
    expect(photos).toHaveLength(1)
    expect(photos[0].getAttribute('src')).toBe('/public-media/1.jpg')
    unmount()

    community.mockResolvedValue({ ...DATA, partnerVorgestellt: [{ slug: 'salon-wilma', name: 'Salon Wilma', fotos: [] }] })
    await render()
    expect(container.querySelector('.community-hero-photo img')).toBeNull()
    expect(container.querySelector('.community-hero-photo svg')).not.toBeNull()
  })

  test('Admin-Einstellung: nur gewählte Zahlen und der eigene Eintrag als interner Link', async () => {
    mockReducedMotion()
    community.mockResolvedValue({ ...DATA, banner: { partnerDesMonats: true, chips: ['familien'], hinweis: { text: 'Neu: Wir waren hier', link: '/partner-werden' } } })
    await render()
    const items = [...container.querySelectorAll('.community-ticker-static li')]
    expect(items.map((li) => li.textContent)).toEqual(['10Familien', 'Neu: Wir waren hier'])
    expect(items[1].querySelector('a').getAttribute('href')).toBe('/partner-werden')
  })

  test('Anhalten: Knopf mit aria-label, danach ruhige Zeile mit allen Einträgen und erreichbarem Partner-Link; wieder abspielen', async () => {
    community.mockResolvedValue(DATA)
    await render()
    const toggle = container.querySelector('.community-ticker-toggle')
    expect(toggle.getAttribute('aria-label')).toBe('Laufband anhalten')
    await act(async () => toggle.click())
    expect(container.querySelector('.community-ticker-viewport')).toBeNull()
    expect(container.querySelectorAll('.community-ticker-static li')).toHaveLength(6)
    expect(container.querySelector('.community-ticker-toggle').getAttribute('aria-label')).toBe('Laufband abspielen')
    await act(async () => container.querySelector('.community-ticker-toggle').click())
    expect(container.querySelector('.community-ticker-viewport')).not.toBeNull()
  })

  test('weniger Bewegung: keine Animation, kein Abspielknopf, die ersten vier Einträge und „mehr“', async () => {
    mockReducedMotion()
    community.mockResolvedValue(DATA)
    await render()
    expect(container.querySelector('.community-ticker-viewport')).toBeNull()
    expect(container.querySelector('.community-ticker-toggle')).toBeNull()
    expect(container.querySelectorAll('.community-ticker-static li')).toHaveLength(4)
    const more = container.querySelector('.community-ticker-more')
    expect(more.getAttribute('aria-expanded')).toBe('false')
    await act(async () => more.click())
    expect(container.querySelectorAll('.community-ticker-static li')).toHaveLength(6)
    expect(more.getAttribute('aria-expanded')).toBe('true')
  })

  test('Nullen fallen weg; alles 0: nichts - nur mit fallback (Startseite) „Gerade starten wir“; Fehler: nichts', async () => {
    community.mockResolvedValue({ ...ZERO, erinnerungen: 3 })
    await render()
    expect(container.querySelector('.visually-hidden').textContent).toBe('3 Erinnerungen.')
    unmount()

    community.mockResolvedValue(ZERO)
    await render()
    expect(region()).toBeNull()
    unmount()

    community.mockResolvedValue(ZERO)
    await render({ fallback: true })
    expect(region().textContent).toContain(TICKER_LEER)
    expect(container.querySelector('.community-ticker-toggle')).toBeNull()
    unmount()

    community.mockRejectedValue(new Error('kaputt'))
    await render({ fallback: true })
    expect(region()).toBeNull()
  })
})
