// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { finanzierung } = vi.hoisted(() => ({ finanzierung: vi.fn() }))
vi.mock('../api', () => ({ api: { finanzierung } }))

import VorstellungPage from './VorstellungPage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'
import { FOLIEN } from '../lib/vorstellung.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

beforeEach(() => {
  finanzierung.mockResolvedValue({ ruecklage: null, quartale: [], verteilung: null })
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  finanzierung.mockReset()
})

function Spy() {
  const { search } = useLocation()
  return <span data-testid="search">{search}</span>
}

async function render(url = '/vorstellung') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[url]}>
        <ThemeProvider>
          <VorstellungPage />
          <Spy />
        </ThemeProvider>
      </MemoryRouter>
    )
  )
}

const title = () => container.querySelector('h1').textContent
const click = (el) => act(() => el.click())
const byName = (name) => [...container.querySelectorAll('.vorstellung-nav button')].find((b) => b.textContent.includes(name))
const press = (key) => act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })))
const dots = () => [...container.querySelectorAll('.vorstellung-dots button')]

describe('VorstellungPage', () => {
  test('startet mit Folie 1, Zurück ist gesperrt', async () => {
    await render()
    expect(title()).toBe('Familie auf Pfoten')
    expect(byName('Zurück').disabled).toBe(true)
    expect(container.querySelector('.vorstellung-count').textContent).toContain('1 von 10')
  })

  test('Weiter und Zurück wechseln die Folie und schreiben ?folie', async () => {
    await render()
    click(byName('Weiter'))
    expect(title()).toBe(FOLIEN[1].title)
    expect(container.querySelector('[data-testid="search"]').textContent).toBe('?folie=2')
    click(byName('Zurück'))
    expect(title()).toBe('Familie auf Pfoten')
  })

  test('Pfeiltasten blättern, an den Enden passiert nichts', async () => {
    await render()
    press('ArrowLeft')
    expect(title()).toBe('Familie auf Pfoten')
    press('ArrowRight')
    expect(title()).toBe(FOLIEN[1].title)
    press('ArrowLeft')
    expect(title()).toBe('Familie auf Pfoten')
  })

  test('?folie=N springt direkt dorthin, ungültige Werte werden begrenzt', async () => {
    await render('/vorstellung?folie=4')
    expect(title()).toBe(FOLIEN[3].title)
    act(() => root.unmount())
    container.remove()
    await render('/vorstellung?folie=99')
    expect(title()).toBe(FOLIEN[9].title)
    expect(byName('Weiter')).toBeUndefined()
    act(() => root.unmount())
    container.remove()
    await render('/vorstellung?folie=abc')
    expect(title()).toBe('Familie auf Pfoten')
  })

  test('Punkte: zehn Stück, aktueller mit aria-current, Klick springt', async () => {
    await render()
    expect(dots()).toHaveLength(10)
    expect(dots()[0].getAttribute('aria-current')).toBe('step')
    click(dots()[4])
    expect(title()).toBe(FOLIEN[4].title)
    expect(dots()[4].getAttribute('aria-current')).toBe('step')
    expect(dots()[0].getAttribute('aria-current')).toBeNull()
  })

  test('die Folie ist eine aria-live-Region', async () => {
    await render()
    const live = container.querySelector('[aria-live="polite"]')
    expect(live).not.toBeNull()
    expect(live.textContent).toContain('Familie auf Pfoten')
  })

  test('Finanz-Folie zeigt die Regel, App-Folie verlinkt /app, letzte Folie die Demo-Kacheln', async () => {
    await render('/vorstellung?folie=8')
    expect(container.querySelector('.finanz-regel')).not.toBeNull()
    expect(finanzierung).toHaveBeenCalledTimes(1)
    click(byName("Weiter"))
    expect(container.querySelector('a[href="/app"]')).not.toBeNull()
    click(byName("Weiter"))
    const tiles = container.querySelectorAll('a[href^="/demo-start"]')
    expect(tiles.length).toBeGreaterThanOrEqual(3)
    expect(tiles[0].getAttribute('target')).toBe('_blank')
  })

  test('Finanz-Folie bleibt ohne Zahlen brauchbar, wenn die Abfrage scheitert', async () => {
    finanzierung.mockRejectedValue(new Error('x'))
    await render('/vorstellung?folie=8')
    expect(container.querySelector('.finanz-regel')).not.toBeNull()
  })
})
