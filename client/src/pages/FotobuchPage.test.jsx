// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({ getDog: vi.fn(), listTimeline: vi.fn() }))
vi.mock('../api', () => ({ api }))

import FotobuchPage from './FotobuchPage.jsx'
import { setLang } from '../lib/i18n/index.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const FLOCKE = { id: 9, name: 'Flocke', tierart: 'katze', foto_url: '/p/flocke.jpg' }
const ENTRIES = [
  { id: 1, datum: '2024-05-01', titel: 'Erster Schnee', text: 'Flocke im Garten', foto_urls: ['/m/1.jpg'], privat: 0 },
  { id: 2, datum: '2025-07-03', titel: 'Am See', text: 'Mit Pepper', foto_urls: [], privat: 0 },
  { id: 3, datum: '2025-08-01', titel: 'Nur für uns', text: 'Tierarzt', foto_urls: [], privat: 1 }
]

let container
let root

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={['/tier/9/fotobuch']}>
        <FotobuchPage dogId="9" />
      </MemoryRouter>
    )
  )
  return container
}

const sheets = () => [...container.querySelectorAll('.voucher-sheet')]
const button = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(text))

beforeEach(() => {
  api.getDog.mockResolvedValue(FLOCKE)
  api.listTimeline.mockResolvedValue(ENTRIES)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  setLang('de')
  vi.clearAllMocks()
})

describe('FotobuchPage', () => {
  test('Titelblatt und Seiten je Jahr, private Erinnerungen erst mit Haken', async () => {
    await render()
    expect(container.querySelector('.fotobuch-cover-name').textContent).toBe('Flocke')
    expect(container.querySelector('.fotobuch-cover-years').textContent).toBe('2024 – 2025')
    expect(sheets()).toHaveLength(3)
    expect(container.textContent).not.toContain('Nur für uns')
    await act(async () => container.querySelector('#fotobuch-private').click())
    expect(container.textContent).toContain('Nur für uns')
  })

  test('Drucken erst, wenn die Bilder geladen sind', async () => {
    await render()
    const print = button('Bilder laden')
    expect(print.disabled).toBe(true)
    expect(container.textContent).toContain('0 von 2')
  })

  test('zwei je Seite und ohne Kapitel: andere Seitenzahl', async () => {
    await render()
    await act(async () => container.querySelector('#fotobuch-chapters').click())
    expect(sheets()).toHaveLength(2)
    expect(container.querySelector('.fotobuch-page.is-4')).not.toBeNull()
    await act(async () => [...container.querySelectorAll('.segmented button')].find((b) => b.textContent === '2').click())
    expect(container.querySelector('.fotobuch-page.is-2')).not.toBeNull()
  })

  test('ohne sichtbare Erinnerungen kein Buch', async () => {
    api.listTimeline.mockResolvedValue([])
    await render()
    expect(container.textContent).toContain('Für ein Fotobuch braucht es mindestens eine Erinnerung.')
    expect(sheets()).toHaveLength(0)
    // E2E 2026-10-10: Druckseiten ohne App-Hülle - auch Hinweis-Zustände brauchen einen Weg zurück.
    expect(container.querySelector('a[href="/tier/9"]')?.textContent).toBe('Zurück zum Tier')
  })

  test('Fehler vom Server (kein Zugriff) erscheint als Hinweis', async () => {
    api.getDog.mockRejectedValue(new Error('Kein Zugriff'))
    await render()
    expect(container.querySelector('[role="alert"]').textContent).toBe('Kein Zugriff')
    // E2E 2026-10-10: Druckseiten ohne App-Hülle - auch Hinweis-Zustände brauchen einen Weg zurück.
    expect(container.querySelector('a[href="/"]')?.textContent).toBe('Zur Startseite')
  })

  test('englisch', async () => {
    setLang('en')
    await render()
    expect(container.querySelector('h1').textContent).toBe('Photo book for Flocke')
    expect(container.querySelector('.fotobuch-cover-title').textContent).toBe('Our story')
    expect(container.textContent).toContain('Memories per page')
    expect(container.textContent).toContain('Include private memories')
  })
})
