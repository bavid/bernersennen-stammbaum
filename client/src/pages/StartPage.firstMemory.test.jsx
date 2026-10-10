// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({
  listDogs: vi.fn(),
  start: vi.fn(),
  erlebtMitOffen: vi.fn(),
  visits: vi.fn(),
  createDog: vi.fn(),
  createTimelineEntry: vi.fn(),
  erlebtMitTiere: vi.fn(),
  upload: vi.fn(),
  onThisDay: vi.fn()
}))
vi.mock('../api', () => ({ api }))

import StartPage from './StartPage.jsx'
import HinweiseProvider from '../components/hinweise/HinweiseProvider.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'
import { rememberFirstMemorySkip } from '../lib/firstMemory.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const home = { id: 1, name: 'Zuhause Lindenhof', art: 'zuhause' }
const atHome = { ...home, home, role: 'leitung', memberships: [], besuche: [] }
const homeArea = { id: 1, name: 'Zuhause Lindenhof', art: 'eigen' }
const familyArea = { id: 5, name: 'Familie Sonnenhang', art: 'familie' }
const item = (id, area) => ({
  type: 'eintrag',
  id,
  area,
  dog: { id: 10, name: 'Wilma', name_unbekannt: false, rasse: null, foto_url: null },
  titel: `Beitrag ${id}`,
  text: '',
  foto_urls: [],
  foto_anzahl: 0,
  datum: '2026-09-27',
  autor_name: 'Lotte',
  created_at: '2026-09-27 10:00:00',
  activity_at: '2026-09-27 10:00:00',
  comment_count: 0,
  privat: false
})
const feed = (items = [], extra = {}) => ({ items, termine: [], notizen: 0, next: null, ...extra })

beforeEach(() => {
  window.localStorage.clear()
  api.listDogs.mockResolvedValue([])
  api.start.mockResolvedValue(feed())
  api.erlebtMitOffen.mockResolvedValue([])
  api.visits.mockResolvedValue({ besuche: [], gaeste: [] })
  api.erlebtMitTiere.mockResolvedValue([])
  api.onThisDay.mockResolvedValue([])
})

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  for (const mock of Object.values(api)) mock.mockReset()
})

async function render(family = atHome) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <ThemeProvider themeId="standard">
          <HinweiseProvider family={family} onFamilyChange={() => {}}>
            <StartPage family={family} onFamilyChange={() => {}} />
          </HinweiseProvider>
        </ThemeProvider>
      </MemoryRouter>
    )
  )
}

const card = () => container.querySelector('.first-memory')

describe('StartPage: „Eure erste Erinnerung“', () => {
  test('neues Zuhause ohne Erinnerung: die Karte steht da, der Composer nicht doppelt', async () => {
    api.listDogs.mockResolvedValue([{ id: 10, name: 'Wilma', name_unbekannt: 0, tierart: 'hund', foto_url: null }])
    await render()
    expect(card()).not.toBeNull()
    expect(container.querySelector('.start-composer')).toBeNull()
  })

  test('nur Erinnerungen aus einer Familie zählen nicht: die Karte steht trotzdem', async () => {
    api.start.mockResolvedValue(feed([item(3, familyArea)]))
    await render()
    expect(card()).not.toBeNull()
  })

  test('mit eigener Erinnerung keine Karte', async () => {
    api.start.mockResolvedValue(feed([item(3, homeArea)]))
    await render()
    expect(card()).toBeNull()
  })

  test('„Später“ einmal gewählt: auch beim nächsten Besuch keine Karte', async () => {
    rememberFirstMemorySkip(1)
    await render()
    expect(card()).toBeNull()
  })

  test('Gast ohne Schreibrecht sieht keine Karte', async () => {
    await render({ ...atHome, role: 'gast' })
    expect(card()).toBeNull()
  })

  test('nach dem Festhalten: neues Tier als Kreis, die Erinnerung im Feed, die Freude bleibt stehen', async () => {
    api.createDog.mockResolvedValue({ id: 31, name: 'Benno', name_unbekannt: 0, tierart: 'hund', foto_url: null })
    api.createTimelineEntry.mockResolvedValue({ id: 90, dog_id: 31, titel: 'Unsere erste Erinnerung', text: 'Benno schläft.', foto_urls: [], datum: '2026-10-10', created_at: '2026-10-10 12:00:00' })
    await render()
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    for (const [id, value] of [['#first-memory-name', 'Benno'], ['#first-memory-sentence', 'Benno schläft.']]) {
      const input = container.querySelector(id)
      act(() => {
        setter.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }
    await act(async () => card().querySelector('form').requestSubmit())
    expect(container.querySelector('.feed-card-title').textContent).toBe('Unsere erste Erinnerung')
    expect(container.textContent).toContain('Benno')
    expect(card().querySelector('[role="status"]').textContent).toContain('Festgehalten')
  })
})
