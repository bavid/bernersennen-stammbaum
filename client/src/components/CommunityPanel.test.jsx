// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

import CommunityPanel from './CommunityPanel.jsx'
import { PHOTO_MS } from './CommunityTicker.jsx'
import { TICKER_LEER } from '../lib/community.js'
import { setLang } from '../lib/i18n/index.js'

// Seitenkarte „Mit dabei“: Partner des Monats mit Foto, Zahlen als ruhige Liste, eigener Eintrag, weniger Bewegung, Englisch.
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const DATA = {
  familien: 10,
  zuhause: 4,
  erinnerungen: 200,
  fotos: 0,
  partner: 3,
  spendenCents: 0,
  partnerVorgestellt: [{ slug: 'pfotenglueck', name: 'Hundeschule Pfotenglück', fotos: ['/public-media/1.jpg', '/public-media/2.jpg', '/public-media/3.jpg'] }],
  banner: { partnerDesMonats: true, hinweis: { text: 'Neu: Wir waren hier', link: '/partner-werden' } }
}
const ZERO = { familien: 0, zuhause: 0, erinnerungen: 0, fotos: 0, partner: 0, spendenCents: 0, partnerVorgestellt: [] }

let container
let root

afterEach(async () => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
  delete window.matchMedia
  vi.useRealTimers()
  await act(async () => setLang('de'))
})

async function render(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <CommunityPanel {...props} />
      </MemoryRouter>
    )
  )
}

const imgs = () => [...container.querySelectorAll('.community-panel-photo img')]

describe('CommunityPanel', () => {
  test('Partner des Monats oben (Foto mit Namen als alt, Link), darunter die Zahlen als Liste ohne Laufband, eigener Eintrag als Link', async () => {
    await render({ data: DATA })
    const region = container.querySelector('[role="region"]')
    expect(region.getAttribute('aria-label')).toBe('Zahlen aus der Gemeinschaft')
    expect(container.querySelector('.community-panel-title').textContent).toBe('Mit dabei')
    const hero = container.querySelector('.community-panel-hero')
    expect(hero.getAttribute('href')).toBe('/p/pfotenglueck')
    expect(hero.textContent).toContain('Partner des Monats')
    expect(hero.textContent).toContain('Hundeschule Pfotenglück')
    expect(imgs()[0].getAttribute('alt')).toBe('Hundeschule Pfotenglück')
    const stats = [...container.querySelectorAll('.community-panel-stats li')].map((li) => li.textContent)
    expect(stats).toEqual(['10Familien', '4Zuhause', '200Erinnerungen', '3Partner'])
    const line = container.querySelector('a.community-panel-line')
    expect(line.getAttribute('href')).toBe('/partner-werden')
    expect(line.textContent).toBe('Neu: Wir waren hier')
    expect(container.querySelector('.community-ticker-track')).toBeNull()
  })

  test('blendet durch die Fotos; bei weniger Bewegung bleibt es beim ersten', async () => {
    vi.useFakeTimers()
    await render({ data: DATA })
    expect(imgs()[0].className).toBe('is-active')
    await act(async () => vi.advanceTimersByTime(PHOTO_MS))
    expect(imgs()[1].className).toBe('is-active')
    act(() => root.unmount())
    root = null
    window.matchMedia = (query) => ({ matches: query.includes('reduce'), addEventListener() {}, removeEventListener() {} })
    await render({ data: DATA })
    await act(async () => vi.advanceTimersByTime(PHOTO_MS * 3))
    expect(imgs()).toHaveLength(1)
    expect(imgs()[0].className).toBe('is-active')
  })

  test('ohne Partner nur Titel und Zahlen; quer als layout „row“', async () => {
    await render({ data: { ...DATA, partnerVorgestellt: [] }, layout: 'row' })
    expect(container.querySelector('.community-panel').className).toContain('is-row')
    expect(container.querySelector('.community-panel-hero')).toBeNull()
    expect(container.querySelectorAll('.community-panel-stats li')).toHaveLength(4)
  })

  test('ohne Daten nichts; alles 0 nur mit fallback der Startsatz', async () => {
    await render({ data: null })
    expect(container.innerHTML).toBe('')
    act(() => root.unmount())
    await render({ data: ZERO })
    expect(container.innerHTML).toBe('')
    act(() => root.unmount())
    await render({ data: ZERO, fallback: true })
    expect(container.querySelector('.community-panel-empty').textContent).toBe(TICKER_LEER)
  })

  test('Englisch: Titel, Kicker und Wörter', async () => {
    await act(async () => setLang('en'))
    await render({ data: DATA })
    expect(container.querySelector('.community-panel-title').textContent).toBe('On board')
    expect(container.querySelector('.community-panel-kicker').textContent).toBe('Partner of the month')
    expect(container.querySelector('.community-panel-stats').textContent).toContain('200memories')
  })
})
