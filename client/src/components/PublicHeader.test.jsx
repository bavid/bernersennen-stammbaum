// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, test } from 'vitest'
import PublicHeader, { backFallback, canGoBack } from './PublicHeader.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  delete document.documentElement.dataset.theme
  document.title = ''
  window.history.replaceState(null, '', '/')
})

function CurrentPath() {
  const { pathname } = useLocation()
  return <output data-testid="path">{pathname}</output>
}

async function render({ entries = ['/impressum'], index, family = null } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={entries} initialIndex={index ?? entries.length - 1}>
        <ThemeProvider themeId="standard">
          <PublicHeader family={family} />
          <CurrentPath />
        </ThemeProvider>
      </MemoryRouter>
    )
  )
  return container
}

const path = () => container.querySelector('[data-testid="path"]').textContent
const backButton = () => [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim() === 'Zurück')

describe('PublicHeader', () => {
  test('zeigt Logo und Namen des Auftritts als Link zur Startseite und einen Knopf "Zurück"', async () => {
    await render()
    const brand = container.querySelector('.public-header-brand')
    expect(brand.getAttribute('href')).toBe('/')
    expect(brand.textContent).toBe('Familie auf Pfoten')
    expect(brand.querySelector('svg')).not.toBeNull()
    expect(backButton()).toBeDefined()
    expect(container.querySelector('h1')).toBeNull()
  })

  test('mit Verlauf in der App: "Zurück" geht einen Schritt zurück', async () => {
    await render({ entries: ['/partner', '/impressum'] })
    expect(path()).toBe('/impressum')

    await act(async () => backButton().click())

    expect(path()).toBe('/partner')
  })

  test('ohne Verlauf und ohne Sitzung: "Zurück" führt zur Startseite (Login)', async () => {
    await render({ entries: ['/datenschutz'] })

    await act(async () => backButton().click())

    expect(path()).toBe('/')
  })

  test('ohne Verlauf, aber angemeldet: "Zurück" führt zur Startseite des Bereichs', async () => {
    await render({ entries: ['/impressum'], family: { id: 1, art: 'zuhause' } })
    await act(async () => backButton().click())
    expect(path()).toBe('/wegbegleiter')

    act(() => root.unmount())
    root = null
    container.remove()

    await render({ entries: ['/partner-werden'], family: { id: 30, art: 'partner' } })
    await act(async () => backButton().click())
    expect(path()).toBe('/profil')
  })
})

describe('canGoBack / backFallback', () => {
  test('BrowserRouter: die Position im Verlauf (history.state.idx) entscheidet', () => {
    window.history.replaceState({ idx: 2, key: 'abc' }, '', '/impressum')
    expect(canGoBack({ key: 'default' })).toBe(true)
    window.history.replaceState({ idx: 0, key: 'abc' }, '', '/impressum')
    expect(canGoBack({ key: 'xyz' })).toBe(false)
  })

  test('ohne history.state (MemoryRouter): nur der Einstieg hat den Schlüssel "default"', () => {
    window.history.replaceState(null, '', '/impressum')
    expect(canGoBack({ key: 'default' })).toBe(false)
    expect(canGoBack({ key: 'k3x9' })).toBe(true)
    expect(canGoBack(undefined)).toBe(false)
  })

  test('Ziel ohne Verlauf: Startroute des Bereichs, ohne Sitzung "/"', () => {
    expect(backFallback(null)).toBe('/')
    expect(backFallback({ art: 'tierheim' })).toBe('/tiere')
    expect(backFallback({ art: 'rudel' })).toBe('/stammbaum')
  })
})
