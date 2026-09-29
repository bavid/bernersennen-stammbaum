// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { me, adminMe, partners, overview, demo, listDogs, config, pending } = vi.hoisted(() => ({
  me: vi.fn(),
  adminMe: vi.fn(),
  partners: vi.fn(),
  overview: vi.fn(),
  demo: vi.fn(),
  listDogs: vi.fn(),
  config: vi.fn(),
  // Die Kundensicht (CustomerViewPage) lädt Vorschau-Daten - hier bleiben sie offen, die Seite selbst reicht.
  pending: () => new Promise(() => {})
}))

vi.mock('./api', () => ({
  api: {
    me,
    demo,
    listDogs,
    config,
    logout: vi.fn(),
    admin: { me: adminMe, partners, overview },
    partnerArea: { previewDiscover: pending, previewPortal: pending, previewAnimal: pending }
  },
  setUnauthorizedHandler: () => {}
}))

import App from './App.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const demoShelter = {
  id: 5,
  name: 'Tierheim Sonnenhang',
  theme: 'standard',
  art: 'tierheim',
  isDemo: true,
  home: { id: 5, name: 'Tierheim Sonnenhang', theme: 'standard', art: 'tierheim' },
  memberships: [],
  auth: { kind: 'none' },
  partner: { id: 1, slug: 'tierheim-sonnenhang', name: 'Tierheim Sonnenhang', typ: 'tierheim', status: 'aktiv', gesperrt: false }
}

beforeEach(() => {
  me.mockRejectedValue(new Error('Fehler 401'))
  overview.mockReturnValue(new Promise(() => {}))
  partners.mockResolvedValue([{ id: 4, slug: 'hundeschule-wiesengrund', name: 'Hundeschule Wiesengrund', typ: 'hundeschule', status: 'entwurf', gesperrt: 0, is_demo: 0 }])
  listDogs.mockResolvedValue([])
  config.mockResolvedValue({ appEnv: 'prod' })
})

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  vi.clearAllMocks()
  delete document.documentElement.dataset.theme
  document.title = ''
})

const WAIT_STEP_MS = 10
// Großzügiger als App.adminPrintRoute.test.jsx: die Kundensicht zieht mit ihrem Chunk Entdecken, Portal und
// Steckbrief nach - und die Navigation dorthin läuft als Transition, die erst mit dem geladenen Chunk sichtbar wird.
const WAIT_MAX_MS = 10000

// Warten, bis die Chunks geladen sind und weder Platzhalter noch Splash stehen.
async function settle(isDone) {
  const start = Date.now()
  while (!isDone() && Date.now() - start < WAIT_MAX_MS) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS))
    })
  }
}

function isSettled() {
  return container.firstChild !== null && !container.querySelector('[role="status"], [aria-busy="true"]')
}

// isDone: woran der Test erkennt, dass die Seite da ist - Vorgabe: kein Platzhalter/Splash mehr. Die Demo-
// Einstiege warten stattdessen auf ihr konkretes Ziel (Kopf der App, Kundensicht, Fehlermeldung).
async function render(path, isDone = isSettled) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    )
  )
  await settle(isDone)
  return container
}

const DEMO_TEST_TIMEOUT_MS = 20000

describe('Route /admin/praesentation', () => {
  test('mit Admin-Sitzung zeigt sie den Präsentationsmodus ohne Admin-Kopf und ohne App-Hülle', async () => {
    adminMe.mockResolvedValue({ username: 'admin' })
    await render('/admin/praesentation')

    expect(container.querySelector('.present-page h1').textContent).toBe('Familie auf Pfoten zeigen')
    expect(container.querySelectorAll('a.present-tile')).toHaveLength(6)
    expect(container.querySelector('#present-partner')).not.toBeNull()
    expect(container.querySelector('.admin-header')).toBeNull()
    expect(container.querySelector('.app-header')).toBeNull()
  })

  test('ohne Admin-Sitzung landet man auf /admin beim Admin-Login', async () => {
    adminMe.mockRejectedValue(new Error('Fehler 401'))
    await render('/admin/praesentation')

    expect(container.querySelector('.admin-login')).not.toBeNull()
    expect(container.querySelector('.present-page')).toBeNull()
    expect(partners).not.toHaveBeenCalled()
  })

  test('der Admin-Kopf verlinkt den Präsentationsmodus', async () => {
    // overview bleibt offen (beforeEach): der Kopf steht schon, die Karten mit ihren vielen Abfragen noch nicht.
    adminMe.mockResolvedValue({ username: 'admin' })
    await render('/admin')

    const link = [...container.querySelectorAll('.admin-header a')].find((a) => a.textContent.includes('Präsentation'))
    expect(link.getAttribute('href')).toBe('/admin/praesentation')
  })
})

describe('Route /demo-start', () => {
  test(
    'ruft POST /api/demo mit as aus der Adresse und landet auf der Startroute des Demo-Bereichs',
    async () => {
      demo.mockResolvedValue(demoShelter)
      await render('/demo-start?as=tierheim', () => container.querySelector('.app-header'))

      expect(demo).toHaveBeenCalledWith({ as: 'tierheim' })
      expect(container.querySelector('.demo-banner')).not.toBeNull()
      expect(container.querySelector('.app-header .app-nav a[href="/tiere"]')).not.toBeNull()
      expect(container.querySelector('.admin-login')).toBeNull()
    },
    DEMO_TEST_TIMEOUT_MS
  )

  // Der Chunk von DemoStartPage ist nach dem ersten Test schon geladen: die Seite steht sofort, api.demo antwortet
  // vor dem 401 von api.me - das darf die Demo-Sitzung nicht wieder wegnehmen (App.jsx settleInitial).
  test(
    'mit ziel=kundensicht landet ein Demo-Partner in der Kundensicht - auch wenn /me erst danach 401 meldet',
    async () => {
      demo.mockResolvedValue(demoShelter)
      await render('/demo-start?as=partner&slug=tierheim-sonnenhang&ziel=kundensicht', () =>
        container.querySelector('.view-mode-switch a[aria-current="page"]')
      )

      expect(demo).toHaveBeenCalledWith({ as: 'partner', slug: 'tierheim-sonnenhang' })
      expect(container.querySelector('.view-mode-switch a[aria-current="page"]').textContent).toContain('Kundensicht')
    },
    DEMO_TEST_TIMEOUT_MS
  )

  test(
    'ein unbekannter Wert für as ruft den Server nicht und zeigt den Hinweis',
    async () => {
      await render('/demo-start?as=admin', () => container.querySelector('[role="alert"]'))

      expect(demo).not.toHaveBeenCalled()
      expect(container.querySelector('[role="alert"]').textContent).toContain('Diese Demo gibt es nicht')
    },
    DEMO_TEST_TIMEOUT_MS
  )
})
