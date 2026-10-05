// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { me, login, demo } = vi.hoisted(() => ({ me: vi.fn(), login: vi.fn(), demo: vi.fn() }))
vi.mock('./api', () => ({
  api: {
    me,
    login,
    demo,
    logout: vi.fn(() => Promise.resolve()),
    listDogs: vi.fn(() => Promise.resolve([])),
    start: vi.fn(() => Promise.resolve({ items: [], termine: [], notizen: 0, next: null })),
    onThisDay: vi.fn(() => Promise.resolve([])),
    recentActivity: vi.fn(() => Promise.resolve([])),
    partnerDemoAvailable: vi.fn(() => Promise.resolve({ demos: [] })),
    publicConfig: vi.fn(() => Promise.resolve({})),
    hinweise: vi.fn(() => Promise.resolve({ hinweise: [] }))
  },
  setUnauthorizedHandler: () => {}
}))

import App from './App.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const home = { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause' }
const atHome = { ...home, isDemo: false, role: 'leitung', home, memberships: [], besuche: [], darstellung: {} }

let container
let root

function Where() {
  const location = useLocation()
  return <output data-testid="where">{location.pathname}</output>
}

async function render(path) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <App />
        <Where />
      </MemoryRouter>
    )
  )
}

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
  me.mockReset()
  login.mockReset()
  demo.mockReset()
})

const where = () => container.querySelector('[data-testid="where"]').textContent

// Wunsch 05.10.: Nach dem Anmelden immer auf Start - nicht auf der Adresse, die vor dem Abmelden offen war. Sonst landet
// ein anderes Zuhause auf /tier/200 der vorigen Familie und sieht „nicht gefunden“.
describe('App – nach dem Anmelden auf Start', () => {
  test('Schlüssel-Anmeldung auf einer alten Tier-Adresse führt auf /start', async () => {
    me.mockRejectedValue(Object.assign(new Error('nicht angemeldet'), { status: 401 }))
    login.mockResolvedValue(atHome)
    await render('/tier/200')
    expect(where()).toBe('/tier/200')

    const input = container.querySelector('#login-secret')
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(input, 'geheim-1234')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const form = input.closest('form')
    await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))

    expect(login).toHaveBeenCalledWith('geheim-1234')
    expect(where()).toBe('/start')
  })

  test('Demo-Einstieg auf einer alten Adresse führt ebenfalls auf Start', async () => {
    me.mockRejectedValue(Object.assign(new Error('nicht angemeldet'), { status: 401 }))
    demo.mockResolvedValue({ ...atHome, isDemo: true })
    await render('/tier/200')

    const button = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Demo ansehen')
    await act(async () => button.click())

    expect(where()).toBe('/start')
  })
})
