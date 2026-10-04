// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { activeArea, reportAreaMismatch } from './lib/activeArea.js'

const { me } = vi.hoisted(() => ({ me: vi.fn() }))
vi.mock('./api', () => ({
  api: { me, logout: vi.fn(() => Promise.resolve()) },
  setUnauthorizedHandler: () => {}
}))

import App from './App.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const home = { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause' }
const atHome = { ...home, isDemo: false, role: 'leitung', home, memberships: [{ id: 2, name: 'Familie Sonnenhang', rolle: 'mitglied' }], besuche: [] }
const inGroup = { ...atHome, id: 2, name: 'Familie Sonnenhang', art: 'rudel', role: 'mitglied' }

let container
let root

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
}

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
  me.mockReset()
})

// Phase W: App nennt api.js den angezeigten Bereich (X-Bereich) und lädt /me neu, wenn der Server einen Wechsel in
// einem anderen Tab meldet (409 BEREICH).
describe('App – X-Bereich', () => {
  test('der angezeigte Bereich ist bekannt, sobald /me geantwortet hat', async () => {
    me.mockResolvedValue(atHome)
    await render('/admin-schreiben')
    expect(activeArea()).toBe(1)
  })

  test('ein gemeldeter Wechsel lädt /me genau einmal neu und übernimmt den neuen Bereich', async () => {
    me.mockResolvedValueOnce(atHome)
    await render('/admin-schreiben')
    let resolveReload
    me.mockReturnValueOnce(new Promise((resolve) => (resolveReload = resolve)))

    act(() => {
      reportAreaMismatch()
      reportAreaMismatch()
    })
    expect(me).toHaveBeenCalledTimes(2)
    await act(async () => resolveReload(inGroup))
    expect(activeArea()).toBe(2)
  })
})
