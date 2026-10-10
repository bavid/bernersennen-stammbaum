// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

vi.mock('../api', () => ({ api: {} }))

import LoginPage from './LoginPage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'
import { setLang } from '../lib/i18n/index.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container?.remove()
  container = null
  setLang('de')
})

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <ThemeProvider themeId="standard">
          <LoginPage onLogin={() => {}} />
        </ThemeProvider>
      </MemoryRouter>
    )
  )
}

// Startseite: ein ruhiger Einstieg „Entdecken“ in der Kopfzeile neben der Sprache - zum öffentlichen Entdecken (/partner).
describe('LoginPage – Einstieg „Entdecken“', () => {
  test('steht in der Kopfzeile vor der Sprachwahl und führt zu /partner', async () => {
    await render()
    const link = container.querySelector('.login-top .login-entdecken')
    expect(link.getAttribute('href')).toBe('/partner')
    expect(link.textContent).toContain('Entdecken')
    expect(link.querySelector('.visually-hidden').textContent).toContain('Tierheime, Hundeschulen und mehr entdecken')
    const actions = container.querySelector('.login-top-actions')
    expect(actions.firstElementChild).toBe(link)
    expect(actions.querySelector('.login-lang')).not.toBeNull()
  })

  test('auf Englisch „Discover“', async () => {
    setLang('en')
    await render()
    const link = container.querySelector('.login-entdecken')
    expect(link.textContent).toContain('Discover')
    expect(link.textContent).toContain('Discover shelters, dog schools and more')
  })
})
