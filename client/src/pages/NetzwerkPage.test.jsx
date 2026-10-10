// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, test } from 'vitest'

import NetzwerkPage from './NetzwerkPage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'
import { NETZWERK_FOLIEN } from '../lib/netzwerk.js'
import { setLang } from '../lib/i18n/index.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(async () => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  await act(async () => setLang('de'))
})

function Spy() {
  const { search } = useLocation()
  return <span data-testid="search">{search}</span>
}

async function render(url = '/netzwerk') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[url]}>
        <ThemeProvider>
          <NetzwerkPage />
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
const ENTWURF = 'Entwurf – so könnte es aussehen'

describe('NetzwerkPage', () => {
  test('sechs Folien, Start mit dem Titel, Zurück gesperrt', async () => {
    await render()
    expect(NETZWERK_FOLIEN).toHaveLength(6)
    expect(title()).toBe('Ein Netz für Tiere in der Stadt')
    expect(byName('Zurück').disabled).toBe(true)
    expect(container.querySelector('.vorstellung-count').textContent).toContain('1 von 6')
    expect(dots()).toHaveLength(6)
  })

  test('Weiter, Zurück und Pfeiltasten blättern und schreiben ?folie', async () => {
    await render()
    click(byName('Weiter'))
    expect(title()).toBe('Ein Trainingsplatz für Luna')
    expect(container.querySelector('[data-testid="search"]').textContent).toBe('?folie=2')
    press('ArrowRight')
    expect(title()).toBe('Freie Plätze auf einen Blick')
    press('ArrowLeft')
    click(byName('Zurück'))
    expect(title()).toBe('Ein Netz für Tiere in der Stadt')
  })

  test('?folie=N springt, ungültige Werte werden begrenzt; Punkte springen', async () => {
    await render('/netzwerk?folie=99')
    expect(title()).toBe('Macht mit beim Netz')
    expect(byName('Weiter')).toBeUndefined()
    click(dots()[3])
    expect(title()).toBe('Ein Willkommensgeschenk vom Salon')
    expect(dots()[3].getAttribute('aria-current')).toBe('step')
  })

  test('die drei Entwürfe sind als Entwurf gekennzeichnet und haben keine echten Knöpfe', async () => {
    for (const nummer of [2, 3, 4]) {
      await render(`/netzwerk?folie=${nummer}`)
      const entwurf = container.querySelector('.netz-entwurf')
      expect(entwurf.textContent).toContain(ENTWURF)
      expect(entwurf.querySelector('button, a, input')).toBeNull()
      act(() => root.unmount())
      container.remove()
    }
    root = null
  })

  test('Börse zeigt die Liste, Wer-sieht-was das Versprechen', async () => {
    await render('/netzwerk?folie=3')
    expect(container.querySelectorAll('.netz-liste-eintrag')).toHaveLength(3)
    click(byName('Weiter'))
    click(byName('Weiter'))
    expect(container.textContent).toContain('Keine fremde Werbung, kein Tracking, kein Datenhandel.')
    expect(container.textContent).not.toMatch(/ohne Werbung|für immer|vorerst/)
  })

  test('Mitmachen verlinkt /partner-werden und die Demos im neuen Tab', async () => {
    await render('/netzwerk?folie=6')
    expect(container.querySelectorAll('a[href="/partner-werden"]').length).toBeGreaterThanOrEqual(2)
    const tiles = container.querySelectorAll('a[href^="/demo-start"]')
    expect(tiles).toHaveLength(3)
    expect(tiles[0].getAttribute('target')).toBe('_blank')
    expect(container.textContent).toContain('heute kostenlos')
  })

  test('englische Beschriftung', async () => {
    await act(async () => setLang('en'))
    await render('/netzwerk?folie=2')
    expect(title()).toBe('A training slot for Luna')
    expect(container.textContent).toContain('Draft – this is how it could look')
    expect(container.textContent).toContain('Shelter asks dog school')
    expect(container.textContent).toContain('Slide 2 of 6')
  })
})
