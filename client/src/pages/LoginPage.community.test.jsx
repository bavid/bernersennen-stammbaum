// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { community } = vi.hoisted(() => ({ community: vi.fn() }))
vi.mock('../api', () => ({ api: { community } }))

import LoginPage from './LoginPage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'

// Startseite: „Mit dabei“ steht je nach Breite an genau EINER Stelle und wird einmal geladen.
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const DATA = {
  familien: 2,
  zuhause: 3,
  erinnerungen: 48,
  fotos: 30,
  partner: 0,
  spendenCents: 0,
  partnerVorgestellt: [{ slug: 'pfotenglueck', name: 'Hundeschule Pfotenglück', fotos: ['/public-media/1.jpg'] }]
}

let container
let root

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
  delete window.matchMedia
  community.mockReset()
})

// Bildschirmbreite vorgeben: min-width-Abfragen treffen zu, wenn die Breite reicht.
function mockWidth(width) {
  window.matchMedia = (query) => {
    const min = /min-width:\s*(\d+)px/.exec(query)
    return { matches: min ? width >= Number(min[1]) : false, addEventListener() {}, removeEventListener() {} }
  }
}

async function render(width) {
  mockWidth(width)
  community.mockResolvedValue(DATA)
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

const count = (selector) => container.querySelectorAll(selector).length

describe('LoginPage – „Mit dabei“ je nach Breite', () => {
  test('ab 1400 px: Seitenkarte als eigene Spalte der Bühne, kein Band', async () => {
    await render(1440)
    expect(count('[role="region"]')).toBe(1)
    expect(count('.login-hero-grid > .login-side .community-panel.is-column')).toBe(1)
    expect(count('.community-ticker')).toBe(0)
    expect(container.querySelector('.login').className).toContain('has-side-panel')
    expect(community).toHaveBeenCalledTimes(1)
  })

  test('901–1399 px: quer unter den Stichworten, kein Band', async () => {
    await render(1180)
    expect(count('[role="region"]')).toBe(1)
    expect(count('.login-hero-inner > .community-panel.is-row')).toBe(1)
    expect(count('.community-ticker')).toBe(0)
    expect(container.querySelector('.login').className).not.toContain('has-side-panel')
    expect(community).toHaveBeenCalledTimes(1)
  })

  test('bis 900 px: das schlanke Band unter der Kopfzeile, keine Karte', async () => {
    await render(390)
    expect(count('[role="region"]')).toBe(1)
    expect(count('.login > .community-ticker')).toBe(1)
    expect(count('.community-panel')).toBe(0)
    expect(community).toHaveBeenCalledTimes(1)
  })

  test('Fehler beim Laden: breite Bühne ohne leere Spalte', async () => {
    mockWidth(1440)
    community.mockRejectedValue(new Error('offline'))
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
    expect(count('.login-side')).toBe(0)
    expect(container.querySelector('.login').className).toBe('login')
  })
})
