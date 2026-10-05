// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { me, logout, listDogs, config } = vi.hoisted(() => ({
  me: vi.fn(),
  logout: vi.fn(),
  listDogs: vi.fn(),
  config: vi.fn()
}))
vi.mock('./api', () => ({
  api: { me, logout, listDogs, config },
  setUnauthorizedHandler: () => {}
}))

import App from './App.jsx'

// /app („Als App aufs Handy“) ist öffentlich - mit und ohne Sitzung, im schlanken öffentlichen Rahmen wie /finanzierung.
// Die Login-Seite verlinkt die Anleitung aus ihrer Karte.
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
  window.localStorage.clear()
  for (const mock of [me, logout, listDogs, config]) mock.mockReset()
})

const WAIT_STEP_MS = 10
const WAIT_MAX_MS = 3000

function isSettled() {
  return container.firstChild !== null && !container.querySelector('[aria-busy="true"], .page-loading')
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

describe('Route /app', () => {
  test('rendert ohne Sitzung mit dem öffentlichen Kopf', async () => {
    me.mockRejectedValue(new Error('401'))
    await render('/app')
    expect(container.querySelector('h1')?.textContent).toBe('Als App aufs Handy')
    expect(container.querySelector('.public-header')).not.toBeNull()
  })

  test('rendert mit Sitzung - ohne App-Hülle', async () => {
    me.mockResolvedValue(loggedInHome)
    await render('/app')
    expect(container.querySelector('h1')?.textContent).toBe('Als App aufs Handy')
    expect(container.querySelector('.app-footer')).toBeNull()
  })

  test('die Login-Seite verlinkt die Anleitung aus der Karte „Als App aufs Handy“', async () => {
    me.mockRejectedValue(new Error('401'))
    await render('/')
    expect(container.querySelector('.install-hint a[href="/app"]')).not.toBeNull()
  })
})
