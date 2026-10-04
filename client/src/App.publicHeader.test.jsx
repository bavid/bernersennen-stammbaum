// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({
  me: vi.fn(),
  logout: vi.fn(),
  config: vi.fn(),
  demo: vi.fn(),
  publicPartners: vi.fn(),
  publicPartner: vi.fn(),
  publicPartnerAnimals: vi.fn(),
  publicHappyEnds: vi.fn(),
  publicPartnerPosts: vi.fn(),
  publicAnimal: vi.fn()
}))
vi.mock('./api', () => ({ api, setUnauthorizedHandler: () => {} }))

import App from './App.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const WAIT_STEP_MS = 10
const WAIT_MAX_MS = 3000

const partner = {
  id: 1,
  slug: 'hundeschule-birkenhain',
  name: 'Hundeschule Birkenhain',
  typ: 'hundeschule',
  plz: '10115',
  ort: 'Berlin',
  logoUrl: null,
  portal_titel: null,
  portal_text: 'Willkommen bei uns.',
  spenden_url: null,
  vermittlung_url: null,
  farbe: null
}

const animal = {
  name: 'Pepper',
  tierart: 'hund',
  geschlecht: 'huendin',
  rasse: null,
  geburtsdatum: null,
  vermittlung_status: 'sucht',
  entries: [],
  shelter: { name: 'Tierheim Birkenweg', slug: 'tierheim-birkenweg', kontakt_email: null, logoUrl: null }
}

beforeEach(() => {
  api.me.mockRejectedValue(new Error('Fehler 401'))
  api.config.mockResolvedValue({ appEnv: 'dev', legal: { name: '', address: '', email: '', phone: '' } })
  api.publicPartners.mockResolvedValue([])
  api.publicPartner.mockResolvedValue(partner)
  api.publicPartnerAnimals.mockResolvedValue([])
  api.publicHappyEnds.mockResolvedValue([])
  api.publicPartnerPosts.mockResolvedValue([])
  api.publicAnimal.mockResolvedValue(animal)
})

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  for (const mock of Object.values(api)) mock.mockReset()
  ;[...document.head.querySelectorAll('meta[name="robots"]')].forEach((el) => el.remove())
  delete document.documentElement.dataset.theme
  document.title = ''
  window.history.replaceState(null, '', '/')
  window.localStorage.clear()
})

function isSettled() {
  return container.firstChild !== null && !container.querySelector('.splash, .page-loading, [aria-busy="true"]')
}

async function waitFor(check) {
  const start = Date.now()
  while (!check() && Date.now() - start < WAIT_MAX_MS) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS))
    })
  }
}

async function render(entries) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const list = Array.isArray(entries) ? entries : [entries]
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={list} initialIndex={list.length - 1}>
        <App />
      </MemoryRouter>
    )
  )
  await waitFor(isSettled)
  return container
}

const backButton = () => [...container.querySelectorAll('.public-header button')].find((btn) => btn.textContent.trim() === 'Zurück')

describe('Öffentliche Seiten – Kopf mit Logo und "Zurück"', () => {
  test.each(['/impressum', '/datenschutz', '/partner', '/partner-werden', '/p/hundeschule-birkenhain', '/t/pepper-ab12cd'])(
    '%s hat den schlanken Kopf mit Logo-Link zur Startseite und "Zurück"',
    async (path) => {
      await render(path)
      await waitFor(() => container.querySelector('.public-header'))

      const header = container.querySelector('.public-page > .public-header')
      expect(header).not.toBeNull()
      expect(header.querySelector('a.public-header-brand').getAttribute('href')).toBe('/')
      expect(backButton()).toBeDefined()
    }
  )

  test.each([
    ['/p/gibt-es-nicht', () => api.publicPartner.mockRejectedValue(new Error('Fehler 404'))],
    ['/t/gibt-es-nicht', () => api.publicAnimal.mockRejectedValue(new Error('Fehler 404'))]
  ])('auch die Seite "gibt es nicht" (%s) hat den Kopf mit "Zurück"', async (path, fail) => {
    fail()
    await render(path)
    await waitFor(() => container.querySelector('.empty-state'))

    expect(container.querySelector('.empty-state h1').textContent).toMatch(/gibt es nicht/)
    expect(container.querySelector('.public-page > .public-header')).not.toBeNull()
  })

  test('nur der schlanke Kopf ist ein <header> (eine banner-Landmarke je Seite)', async () => {
    for (const path of ['/impressum', '/partner', '/p/hundeschule-birkenhain', '/t/pepper-ab12cd']) {
      await render(path)
      await waitFor(() => container.querySelector('.public-header'))
      const banners = [...container.querySelectorAll('header')].filter((el) => !el.parentElement.closest('article, aside, main, nav, section'))
      expect(banners, path).toHaveLength(1)
      act(() => root.unmount())
      root = null
      container.remove()
      container = null
    }
  })

  test('mit Verlauf: von der Partnerliste ins Impressum und mit "Zurück" wieder zur Partnerliste', async () => {
    await render(['/partner', '/impressum'])
    expect(container.querySelector('h1').textContent).toBe('Impressum')

    await act(async () => backButton().click())
    await waitFor(() => container.querySelector('.partners-page'))

    expect(container.querySelector('h1').textContent).toBe('Unsere Partner')
  })

  test('ohne Verlauf und ohne Sitzung: "Zurück" auf dem Datenschutz führt zur Login-Seite', async () => {
    await render('/datenschutz')

    await act(async () => backButton().click())
    await waitFor(() => container.querySelector('#login-secret'))

    expect(container.querySelector('#login-secret')).not.toBeNull()
  })
})

// Phase U: Rundgang in einer Partner- oder Tierheim-Demo.
describe('Hinweis in der Partner-Demo', () => {
  const partnerDemo = {
    id: 90,
    name: 'Hundeschule Pfotenglück',
    theme: 'standard',
    art: 'partner',
    isDemo: true,
    home: { id: 90, name: 'Hundeschule Pfotenglück', theme: 'standard', art: 'partner' },
    memberships: [],
    partner: { id: 9, slug: 'hundeschule-pfotenglueck', name: 'Hundeschule Pfotenglück', typ: 'hundeschule', status: 'aktiv' }
  }
  const shelterDemo = {
    ...partnerDemo,
    id: 91,
    name: 'Tierheim Birkenweg',
    art: 'tierheim',
    home: { id: 91, name: 'Tierheim Birkenweg', theme: 'standard', art: 'tierheim' },
    partner: { id: 10, slug: 'tierheim-birkenweg', name: 'Tierheim Birkenweg', typ: 'tierheim', status: 'aktiv' }
  }
  const guideLinks = () => [...container.querySelectorAll('.demo-guide-links a')].map((a) => [a.textContent, a.getAttribute('href')])

  test('Partner-Demo: Hinweis oben im Inhalt mit Profil, Kundensicht und Beiträge', async () => {
    api.me.mockResolvedValue(partnerDemo)
    await render('/admin-schreiben')

    const guide = container.querySelector('main .demo-guide')
    expect(guide.textContent).toContain('Das ist die Demo eines Partner-Bereichs')
    expect(guideLinks()).toEqual([
      ['Profil bearbeiten', '/profil'],
      ['Kundensicht', '/kundensicht'],
      ['Beiträge', '/beitraege']
    ])
  })

  test('Tierheim-Demo: statt Beiträge die Tiere', async () => {
    api.me.mockResolvedValue(shelterDemo)
    await render('/admin-schreiben')
    expect(guideLinks()[2]).toEqual(['Tiere', '/tiere'])
  })

  test.each([
    ['ein echter Partner-Bereich', { ...partnerDemo, isDemo: false }],
    ['die Admin-Ansicht einer Partner-Demo', { ...partnerDemo, adminView: true }],
    ['eine Zuhause-Demo', { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause', isDemo: true, home: null, memberships: [] }]
  ])('kein Hinweis für %s', async (_label, me) => {
    api.me.mockResolvedValue(me)
    await render('/admin-schreiben')
    expect(container.querySelector('.app-main')).not.toBeNull()
    expect(container.querySelector('.demo-guide')).toBeNull()
  })

  // Feedback-Runde: auf einem Partner-Portal, einem Steckbrief und der Partnerliste steht keine Demo - auch nicht, weil die
  // Sitzung eine Demo ist.
  const homeDemo = { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause', isDemo: true, home: null, memberships: [] }
  test.each([
    ['/p/hundeschule-birkenhain', 'einer Partner-Demo', partnerDemo, '.partner-portal h1', 'Hundeschule Birkenhain'],
    ['/p/hundeschule-birkenhain', 'einer Zuhause-Demo', homeDemo, '.partner-portal h1', 'Hundeschule Birkenhain'],
    ['/t/pepper-ab12cd', 'einer Partner-Demo', partnerDemo, '.steckbrief-page h1', 'Pepper'],
    ['/t/pepper-ab12cd', 'einer Zuhause-Demo', homeDemo, '.steckbrief-page h1', 'Pepper'],
    ['/partner', 'einer Partner-Demo', partnerDemo, '.partners-page h1', 'Unsere Partner'],
    ['/partner', 'einer Zuhause-Demo', homeDemo, '.partners-page h1', 'Unsere Partner']
  ])('auf %s in %s: die Seite in der App-Hülle, ohne Demo-Hinweis, Rundgang und Umschalter', async (path, _label, me, heading, title) => {
    api.me.mockResolvedValue(me)
    await render('/admin-schreiben')
    // Gegenprobe: auf den Seiten des eigenen Bereichs steht der Demo-Hinweis (in der Partner-Demo auch Rundgang und Umschalter).
    expect(container.querySelector('.demo-banner')).not.toBeNull()
    if (me.art === 'partner') {
      expect(container.querySelector('.demo-guide')).not.toBeNull()
      expect(container.querySelector('.view-mode-switch')).not.toBeNull()
    }
    act(() => root.unmount())
    root = null
    container.remove()

    await render(path)
    await waitFor(() => container.querySelector(heading))

    expect(container.querySelector(`main.app-main ${heading}`).textContent).toBe(title)
    expect(container.querySelectorAll('header')).toHaveLength(1)
    expect(container.querySelector('.app-header')).not.toBeNull()
    expect(container.querySelector('.public-header')).toBeNull()
    expect(container.querySelector('.public-footer')).toBeNull()
    expect(container.querySelector('.demo-banner')).toBeNull()
    expect(container.querySelector('.demo-guide')).toBeNull()
    expect(container.querySelector('.view-mode-switch')).toBeNull()
    expect(container.textContent).not.toMatch(/Demo/i)
  })

  test('schließen blendet ihn aus und merkt es sich für die nächste Demo', async () => {
    api.me.mockResolvedValue(partnerDemo)
    await render('/admin-schreiben')

    await act(async () => container.querySelector('.demo-guide-close').click())
    expect(container.querySelector('.demo-guide')).toBeNull()

    act(() => root.unmount())
    root = null
    container.remove()
    await render('/admin-schreiben')
    expect(container.querySelector('.app-main')).not.toBeNull()
    expect(container.querySelector('.demo-guide')).toBeNull()
  })
})
