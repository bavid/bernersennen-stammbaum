// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { me, logout, listDogs, config, finanzierung } = vi.hoisted(() => ({
  me: vi.fn(),
  logout: vi.fn(),
  listDogs: vi.fn(),
  config: vi.fn(),
  finanzierung: vi.fn()
}))
vi.mock('./api', () => ({
  api: { me, logout, listDogs, config, finanzierung },
  setUnauthorizedHandler: () => {}
}))

import App from './App.jsx'

// Phase F: /finanzierung ist öffentlich (mit und ohne Sitzung) und von Login-Seite, App-Fuß und Datenschutz verlinkt.
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const loggedInHome = { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause', isDemo: false, home: null, memberships: [] }

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
  for (const mock of [me, logout, listDogs, config, finanzierung]) mock.mockReset()
})

const WAIT_STEP_MS = 10
const WAIT_MAX_MS = 3000

// Wie App.partnerWerdenRoute.test.jsx: die Seite kommt als eigener Chunk über einen echten dynamischen Import - warten,
// bis weder Platzhalter noch Splash mehr zu sehen sind.
function isSettled() {
  return container.firstChild !== null && !container.querySelector('[role="status"], [aria-busy="true"]')
}

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
  const start = Date.now()
  while (!isSettled() && Date.now() - start < WAIT_MAX_MS) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS))
    })
  }
  return container
}

describe('Route /finanzierung', () => {
  test('rendert ohne Sitzung', async () => {
    me.mockRejectedValue(new Error('401'))
    finanzierung.mockResolvedValue({ spendenHinweis: null, ziel: null, quartale: [] })
    await render('/finanzierung')
    expect(container.querySelector('h1')?.textContent).toBe('So finanzieren wir uns')
  })

  test('rendert mit Sitzung - ohne App-Hülle, mit dem öffentlichen Kopf', async () => {
    me.mockResolvedValue(loggedInHome)
    finanzierung.mockResolvedValue({ spendenHinweis: null, ziel: null, quartale: [] })
    await render('/finanzierung')
    expect(container.querySelector('h1')?.textContent).toBe('So finanzieren wir uns')
    expect(container.querySelector('.public-header')).not.toBeNull()
    expect(container.querySelector('.app-footer')).toBeNull()
  })

  test('der App-Fuß verlinkt „So finanzieren wir uns“ neben Impressum und Datenschutz', async () => {
    me.mockResolvedValue(loggedInHome)
    listDogs.mockResolvedValue([])
    await render('/wegbegleiter')
    const links = [...container.querySelectorAll('.app-footer-legal a')].map((a) => [a.textContent.trim(), a.getAttribute('href')])
    expect(links).toEqual([
      ['So finanzieren wir uns', '/finanzierung'],
      ['Impressum', '/impressum'],
      ['Datenschutz', '/datenschutz']
    ])
  })

  test('der Datenschutz verlinkt die Seite in „Keine Tracker, keine fremden Dienste“', async () => {
    me.mockRejectedValue(new Error('401'))
    config.mockResolvedValue({ appEnv: 'dev', legal: { name: '', address: '', email: '', phone: '' } })
    await render('/datenschutz')
    const section = container.querySelector('section#tracker')
    expect(section.querySelector('a[href="/finanzierung"]')).not.toBeNull()
    // Weiterhin ein Absatz - kein „Mehr“-Knopf.
    expect(section.querySelectorAll('p')).toHaveLength(1)
  })
})
