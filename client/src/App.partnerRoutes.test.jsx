// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { me, logout, publicPartner, publicPartners, publicPartnerAnimals, publicHappyEnds, publicPartnerPosts, publicAnimal } = vi.hoisted(() => ({
  me: vi.fn(),
  logout: vi.fn(),
  publicAnimal: vi.fn(),
  publicPartner: vi.fn(),
  publicPartners: vi.fn(),
  publicPartnerAnimals: vi.fn(),
  publicHappyEnds: vi.fn(),
  // Phase P2: "Aktuelles" auf dem Portal - hier reicht eine leere Liste.
  publicPartnerPosts: vi.fn(() => Promise.resolve([]))
}))
vi.mock('./api', () => ({
  api: { me, logout, publicAnimal, publicPartner, publicPartners, publicPartnerAnimals, publicHappyEnds, publicPartnerPosts },
  setUnauthorizedHandler: () => {}
}))

import App from './App.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const loggedInHome = {
  id: 1,
  name: 'Zuhause am Deich',
  theme: 'standard',
  art: 'zuhause',
  isDemo: false,
  home: null,
  memberships: []
}

const partner = {
  id: 1,
  slug: 'tierheim-sonnenhang',
  name: 'Tierheim Sonnenhang',
  typ: 'tierheim',
  plz: '10115',
  ort: 'Berlin',
  lat: 52.52,
  lon: 13.41,
  website: null,
  kontakt_email: null,
  kontakt_telefon: null,
  logoUrl: null,
  badge: 'partner',
  portal_titel: null,
  portal_text: 'Willkommen bei uns.',
  spenden_url: null,
  vermittlung_url: null,
  farbe: '#2f6b3f'
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
  delete document.documentElement.dataset.theme
  document.title = ''
  window.history.replaceState(null, '', '/')
  me.mockReset()
  logout.mockReset()
  publicAnimal.mockReset()
  publicPartner.mockReset()
  publicPartners.mockReset()
  publicPartnerAnimals.mockReset()
  publicHappyEnds.mockReset()
  vi.restoreAllMocks()
})

async function render(initialEntry) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <App />
      </MemoryRouter>
    )
  )
  return container
}

// Feedback-Runde: das Portal löst keinen Code mehr selbst ein - ein leiser Link führt zum Einlösen auf /v. Angemeldet steht
// es in der normalen Hülle der App (ein Kopf, ein Fuß), ohne Einladungscode und ohne "Zurück zu eurer Chronik".
describe('Route /p/:slug – Portal ohne und mit Sitzung', () => {
  test('ohne Sitzung: schlanker öffentlicher Kopf; "Code einlösen" am Ende von "Kontakt" führt zum Einlösen auf /v', async () => {
    me.mockRejectedValue(new Error('401'))
    publicPartner.mockResolvedValue(partner)
    await render('/p/tierheim-sonnenhang')

    expect(container.querySelector('h1').textContent).toBe('Tierheim Sonnenhang')
    expect(container.querySelectorAll('header')).toHaveLength(1)
    expect(container.querySelector('.public-header')).not.toBeNull()
    expect(container.querySelector('.app-header')).toBeNull()
    expect(container.querySelector('#redeem-code')).toBeNull()

    const link = container.querySelector('#portal-panel-kontakt .portal-code-note a')
    expect(link.getAttribute('href')).toBe('/v')
    await act(async () => link.click())

    expect(container.querySelector('#redeem-code')).not.toBeNull()
  })

  test('mit Sitzung: das Portal in der Hülle der App - ein Kopf, ein Fuß, kein Einladungscode, keine doppelten Wege zurück', async () => {
    me.mockResolvedValue(loggedInHome)
    publicPartner.mockResolvedValue(partner)
    await render('/p/tierheim-sonnenhang')

    const main = container.querySelector('main.app-main')
    expect(main.querySelector('.partner-portal h1').textContent).toBe('Tierheim Sonnenhang')
    expect(container.querySelectorAll('.app-header')).toHaveLength(1)
    expect(container.querySelectorAll('.app-footer')).toHaveLength(1)
    expect(container.querySelector('.public-header')).toBeNull()
    expect(container.querySelector('.public-footer')).toBeNull()
    expect(container.querySelector('.portal-brand-strip')).toBeNull()
    expect(container.querySelector('.portal-code-note')).toBeNull()
    expect(container.textContent).not.toContain('Einladungscode')
    expect(container.textContent).not.toContain('Zurück zu eurer Chronik')
    // Der Name des Partners steht im Inhalt genau einmal als Überschrift.
    expect([...container.querySelectorAll('h1, h2')].filter((h) => h.textContent === 'Tierheim Sonnenhang')).toHaveLength(1)
  })

  test('mit Sitzung und ohne jeden Kontaktweg: kein leerer Reiter "Kontakt"', async () => {
    me.mockResolvedValue(loggedInHome)
    publicPartner.mockResolvedValue(partner)
    await render('/p/tierheim-sonnenhang?reiter=kontakt')

    const tabs = [...container.querySelectorAll('[role="tab"]')].map((tab) => tab.firstChild.textContent)
    // Im eigenen Zuhause steht seit „Wir waren hier“ dessen Reiter da - „Kontakt“ bleibt ohne Kontaktweg weg.
    expect(tabs).toEqual(['Übersicht', 'Wir waren hier'])
  })
})

describe('Route /partner – öffentliche Partnerliste', () => {
  test('rendert unabhängig vom Login-Status', async () => {
    me.mockRejectedValue(new Error('401'))
    publicPartners.mockResolvedValue([])
    await render('/partner')

    expect(container.querySelector('h1')?.textContent).toBe('Entdecken')
  })
})

// Feedback-Runde: Steckbrief und Partnerliste wie das Portal - ohne Sitzung mit dem schlanken öffentlichen Kopf, angemeldet
// in der normalen Hülle der App (ein Kopf, ein Fuß, kein zweites "Zurück").
describe('Steckbrief (/t/:slug) und Partnerliste (/partner) – ohne und mit Sitzung', () => {
  const animal = {
    name: 'Benno',
    tierart: 'hund',
    geschlecht: 'ruede',
    rasse: 'Mischling',
    geburtsdatum: null,
    vermittlung_status: 'in_vermittlung',
    entries: [],
    shelter: { name: 'Tierheim Sonnenhang', slug: 'tierheim-sonnenhang', kontakt_email: null, logoUrl: null }
  }
  const pages = [
    ['/t/benno-ab12cd', '.steckbrief-page', 'Benno'],
    ['/partner', '.partners-page', 'Entdecken']
  ]
  const backButtons = () => [...container.querySelectorAll('button')].filter((btn) => btn.textContent.trim() === 'Zurück')

  beforeEach(() => {
    publicAnimal.mockResolvedValue(animal)
    publicPartners.mockResolvedValue([])
  })

  test.each(pages)('ohne Sitzung (%s): schlanker öffentlicher Kopf mit "Zurück" und eigener Fuß', async (path, page, title) => {
    me.mockRejectedValue(new Error('401'))
    await render(path)

    expect(container.querySelector(`.public-page${page} h1`).textContent).toBe(title)
    expect(container.querySelectorAll('header')).toHaveLength(1)
    expect(container.querySelector('.public-header')).not.toBeNull()
    expect(container.querySelector('.public-footer')).not.toBeNull()
    expect(container.querySelector('.app-header')).toBeNull()
    expect(backButtons()).toHaveLength(1)
  })

  test.each(pages)('mit Sitzung (%s): in der Hülle der App - ein Kopf, ein Fuß, kein "Zurück"', async (path, page, title) => {
    me.mockResolvedValue(loggedInHome)
    await render(path)

    expect(container.querySelector(`main.app-main ${page} h1`).textContent).toBe(title)
    expect(container.querySelector(`${page}.public-page`)).toBeNull()
    expect(container.querySelectorAll('.app-header')).toHaveLength(1)
    expect(container.querySelectorAll('.app-footer')).toHaveLength(1)
    expect(container.querySelector('.public-header')).toBeNull()
    expect(container.querySelector('.public-footer')).toBeNull()
    expect(backButtons()).toHaveLength(0)
  })

  test('mit Sitzung: auch „Diesen Steckbrief gibt es nicht“ steht in der Hülle der App', async () => {
    me.mockResolvedValue(loggedInHome)
    publicAnimal.mockRejectedValue(new Error('404'))
    await render('/t/gibt-es-nicht')

    expect(container.querySelector('main.app-main .steckbrief-missing h1').textContent).toBe('Diesen Steckbrief gibt es nicht')
    expect(container.querySelectorAll('header')).toHaveLength(1)
    expect(container.querySelector('.public-header')).toBeNull()
    expect(container.querySelector('.public-footer')).toBeNull()
  })
})
