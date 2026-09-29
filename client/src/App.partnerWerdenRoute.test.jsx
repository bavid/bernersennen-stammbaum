// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { me, config, demo, printBatch, listDogs } = vi.hoisted(() => ({
  me: vi.fn(),
  config: vi.fn(),
  demo: vi.fn(),
  printBatch: vi.fn(),
  listDogs: vi.fn()
}))

vi.mock('./api', () => ({
  api: {
    me,
    config,
    demo,
    listDogs,
    logout: vi.fn(),
    partnerArea: { printBatch }
  },
  setUnauthorizedHandler: () => {}
}))

import App from './App.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const partner = { id: 7, slug: 'hundeschule-beispielwiese', name: 'Hundeschule Beispielwiese', typ: 'hundeschule', status: 'aktiv', gesperrt: false }
const partnerArea = {
  id: 70,
  name: partner.name,
  theme: 'standard',
  art: 'partner',
  isDemo: false,
  home: { id: 70, name: partner.name, theme: 'standard', art: 'partner' },
  memberships: [],
  auth: { kind: 'key' },
  partner
}
const household = { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause', isDemo: false, home: null, memberships: [] }

beforeEach(() => {
  config.mockResolvedValue({ appEnv: 'prod', publicUrl: 'https://beispiel-chronik.de', legal: { email: 'hallo@beispiel-chronik.de' } })
  listDogs.mockResolvedValue([])
})

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  vi.clearAllMocks()
  ;[...document.head.querySelectorAll('meta[name="robots"]')].forEach((el) => el.remove())
  delete document.documentElement.dataset.theme
  document.title = ''
})

const WAIT_STEP_MS = 10
const WAIT_MAX_MS = 3000

// Wie App.adminPrintRoute.test.jsx: die Chunks laden über echte dynamische Importe - warten, bis weder
// Platzhalter noch Splash mehr zu sehen sind.
function isSettled() {
  return container.firstChild !== null && !container.querySelector('[role="status"], [aria-busy="true"]')
}

async function render(path) {
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
  const start = Date.now()
  while (!isSettled() && Date.now() - start < WAIT_MAX_MS) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS))
    })
  }
  return container
}

describe('Route /partner-werden', () => {
  test('ohne Sitzung zeigt sie die Infoseite ohne App-Hülle', async () => {
    me.mockRejectedValue(new Error('Fehler 401'))
    await render('/partner-werden')

    expect(container.querySelector('.partner-info-page h1').textContent).toBe('Euer Auftritt bei Familie auf Pfoten')
    expect(container.querySelector('.app-header')).toBeNull()
    expect(container.querySelector('#login-secret')).toBeNull()
    expect(document.head.querySelector('meta[name="robots"]').getAttribute('content')).toBe('noindex')
  })

  test('auch mit laufender Sitzung bleibt sie erreichbar', async () => {
    me.mockResolvedValue(household)
    await render('/partner-werden')
    expect(container.querySelector('.partner-info-page')).not.toBeNull()
  })

  test('der Demo-Knopf meldet im Demo-Partner-Bereich an und wechselt zu dessen Startseite /profil', async () => {
    me.mockRejectedValue(new Error('Fehler 401'))
    demo.mockResolvedValue({ ...partnerArea, id: 90, isDemo: true })
    await render('/partner-werden')

    const demoButton = [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'Demo als Hundeschule ansehen')
    await act(async () => demoButton.click())
    const start = Date.now()
    while (!container.querySelector('.app-header') && Date.now() - start < WAIT_MAX_MS) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS))
      })
    }

    expect(demo).toHaveBeenCalledWith({ as: 'partner', slug: 'hundeschule-pfotenglueck' })
    expect(container.querySelector('.app-header .app-nav a[href="/profil"]')).not.toBeNull()
    expect(container.querySelector('.demo-banner')).not.toBeNull()
  })
})

describe('Route /partner-drucken/:id', () => {
  test('im Partner-Bereich zeigt sie die Druckseite des Stapels ohne App-Hülle', async () => {
    me.mockResolvedValue(partnerArea)
    printBatch.mockResolvedValue({
      batch: { id: 12, label: 'Weitergabe Hundeschule Beispielwiese', zweck: 'chronik', partnerTyp: null, partner: { name: partner.name, logoUrl: null, farbe: null } },
      codes: ['ABCD-EFGH-JKLM'],
      nichtDruckbar: 0
    })
    await render('/partner-drucken/12')

    expect(printBatch).toHaveBeenCalledWith('12')
    expect(container.querySelector('.print-page h1').textContent).toBe('Weitergabe Hundeschule Beispielwiese')
    expect(container.querySelector('.voucher-card').dataset.design).toBe('partner')
    expect(container.querySelector('.app-header')).toBeNull()
  })

  test('ohne Sitzung landet man beim Login, Druckdaten werden nicht geladen', async () => {
    me.mockRejectedValue(new Error('Fehler 401'))
    await render('/partner-drucken/12')

    expect(container.querySelector('#login-secret')).not.toBeNull()
    expect(printBatch).not.toHaveBeenCalled()
  })

  test('ein Zuhause landet auf seiner Startseite, Druckdaten werden nicht geladen', async () => {
    me.mockResolvedValue(household)
    await render('/partner-drucken/12')

    expect(printBatch).not.toHaveBeenCalled()
    expect(container.querySelector('.print-page')).toBeNull()
    expect(container.querySelector('.app-header')).not.toBeNull()
  })
})
