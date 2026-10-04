// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// api.me() bleibt hier absichtlich unbeantwortet: family bleibt undefined, App zeigt den Splash-Screen.
vi.mock('./api', () => ({
  api: { me: () => new Promise(() => {}) },
  setUnauthorizedHandler: () => {}
}))

import App from './App.jsx'
import { writeSetting } from './lib/storage.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  if (container) {
    act(() => container.remove())
    container = null
  }
  delete document.documentElement.dataset.theme
  document.title = ''
  window.localStorage.clear()
})

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter initialEntries={['/stammbaum']}>
        <App />
      </MemoryRouter>
    )
  )
  return container
}

describe('Splash-Screen vor der /api/me-Antwort', () => {
  test('zeigt das Pfoten-Logo - auch wenn ein alter Auftritt gemerkt ist (B+ Familienalbum: einer für alle)', async () => {
    writeSetting('lastThemeId', 'berner')
    await render()
    expect(container.querySelector('.splash svg').getAttribute('data-mark')).toBe('paw')
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })
})
