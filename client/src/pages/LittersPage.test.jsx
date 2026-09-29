// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({
  listDogs: vi.fn(),
  listAllDogs: vi.fn(),
  listBreedingEvents: vi.fn(),
  listTimeline: vi.fn()
}))
vi.mock('../api', () => ({ api }))

import LittersPage from './LittersPage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const family = { id: 2, name: 'Familie Sonnenhang', art: 'rudel', role: 'leitung', isDemo: false, home: null, memberships: [] }

const dog = (id, name, extra = {}) => ({ id, name, geschlecht: 'huendin', tierart: 'hund', geburtsdatum: '2016-03-02', can_edit: 1, ...extra })
const dogs = [
  dog(1, 'Frieda'),
  dog(2, 'Anton', { geschlecht: 'ruede' }),
  dog(3, 'Paula', { mother_dog_id: 1, father_dog_id: 2, geburtsdatum: '2021-04-18' }),
  dog(4, 'Moritz', { geschlecht: 'ruede', mother_dog_id: 1, father_dog_id: 2, geburtsdatum: '2021-04-18' })
]
const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
const events = [
  { id: 1, mutter_dog_id: 1, mutter_name: 'Frieda', vater_dog_id: 2, vater_name: 'Anton', datum: '2021-02-14', wurf_info: 'Zwei Kleine.', foto_urls: [] },
  { id: 2, mutter_dog_id: 1, mutter_name: 'Frieda', vater_dog_id: 2, vater_name: 'Anton', datum: daysAgo(10), wurf_info: null, foto_urls: [] }
]

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  for (const mock of Object.values(api)) mock.mockReset()
  delete document.documentElement.dataset.theme
  document.title = ''
})

async function render(themeId) {
  api.listDogs.mockResolvedValue(dogs)
  api.listAllDogs.mockResolvedValue(dogs)
  api.listBreedingEvents.mockResolvedValue(events)
  api.listTimeline.mockResolvedValue([])
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <ThemeProvider themeId={themeId}>
          <LittersPage family={family} />
        </ThemeProvider>
      </MemoryRouter>
    )
  )
  return container
}

const button = (label) => [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim() === label)

describe('LittersPage im Standard-Auftritt: "Nachwuchs" und "Verpaarung" (Phase U)', () => {
  test('Überschriften, Karte, Erwartetes und Verpaarungen ohne Zucht-Wörter', async () => {
    await render('standard')

    expect(container.querySelector('.eyebrow').textContent).toBe('Nachwuchs')
    expect(container.querySelector('.litter-title').textContent).toBe('Nachwuchs vom 18. April 2021')
    expect(container.querySelector('.litter-breeding').textContent).toContain('Verpaarung am 14. Februar 2021')
    expect(container.querySelector('.planned-litter').textContent).toMatch(/Verpaarung .* · Nachwuchs in etwa \d+ Tagen/)
    expect(container.querySelector('#breeding-records-title').textContent).toBe('Verpaarungen')
    expect(container.textContent).not.toMatch(/Stammbaum|Würfe|Wurf|Deckakt|Zucht|züchte|Welpe/)
  })

  test('kein eigener Reiter - oben führt ein Link zurück zur Familienbande', async () => {
    await render('standard')
    const back = container.querySelector('.back-link')
    expect(back.getAttribute('href')).toBe('/stammbaum')
    expect(back.textContent.trim()).toBe('Familienbande')
  })

  test('"Verpaarung eintragen" öffnet das Formular mit neutralen Beschriftungen', async () => {
    await render('standard')
    await act(async () => button('Verpaarung eintragen').click())

    const form = container.querySelector('.breeding-form')
    expect(form.querySelector('h3').textContent).toBe('Verpaarung eintragen')
    expect(form.querySelector('label[for="breeding-date"]').textContent).toContain('Datum der Verpaarung')
    expect(form.querySelector('#wurf-info').getAttribute('placeholder')).toBe('Anzahl Jungtiere, Besonderheiten, Ultraschall …')
  })
})

describe('LittersPage im Berner-Auftritt: unverändert', () => {
  test('"Würfe", "Wurf vom …", "Deckakt" und "Zuchtbuch" - ohne Zurück-Link (eigener Reiter)', async () => {
    await render('berner')

    expect(container.querySelector('.eyebrow').textContent).toBe('Würfe')
    expect(container.querySelector('.litter-title').textContent).toBe('Wurf vom 18. April 2021')
    expect(container.querySelector('.litter-breeding').textContent).toContain('Deckakt am 14. Februar 2021')
    expect(container.querySelector('.planned-litter').textContent).toMatch(/Deckakt .* · Welpen in etwa \d+ Tagen/)
    expect(container.querySelector('#breeding-records-title').textContent).toBe('Zuchtbuch')
    expect(button('Deckakt eintragen')).toBeDefined()
    expect(container.querySelector('.page-lede').textContent).toContain('Entsteht automatisch aus dem Stammbaum')
    expect(container.querySelector('.back-link')).toBeNull()
  })
})
