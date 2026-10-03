// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { getDog, listTimeline, listBreedingEvents, listAllDogs, addComment, deleteComment } = vi.hoisted(() => ({
  getDog: vi.fn(),
  listTimeline: vi.fn(),
  listBreedingEvents: vi.fn(),
  listAllDogs: vi.fn(),
  addComment: vi.fn(),
  deleteComment: vi.fn()
}))

vi.mock('../api', () => ({
  api: { getDog, listTimeline, listBreedingEvents, listAllDogs, addComment, deleteComment }
}))

import DogDetailPage, { ParentLink } from './DogDetailPage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

// Ein Haushalt (Zuhause 3) als gewöhnliches Mitglied in Familie Sonnenhang (aktiver Bereich, id 2). Löschen von
// Kommentaren richtet sich in einer Familie nach vonMir/Rolle (Phase R, lib/roles.js) - siehe auch
// DogDetailPage.roles.test.jsx.
const activeFamily = {
  id: 2,
  name: 'Familie Sonnenhang',
  theme: 'standard',
  art: 'rudel',
  isDemo: false,
  role: 'mitglied',
  home: { id: 3, name: 'Haus Birkenweg', theme: 'standard', art: 'zuhause' },
  memberships: [{ id: 2, name: 'Familie Sonnenhang', theme: 'standard', rolle: 'mitglied' }]
}

// Nele: ein von "Zuhause am Deich" (Bereich 1) in Familie Sonnenhang (aktiver Bereich, id 2) geteiltes Tier.
const sharedDog = () => ({
  id: 10,
  name: 'Nele',
  name_unbekannt: false,
  tierart: 'hund',
  geschlecht: 'huendin',
  geburtsdatum: '2019-03-10',
  rasse: 'Mischling',
  farbe_markings: null,
  beschreibung: null,
  foto_url: null,
  familyName: 'Zuhause am Deich',
  ownerFamilyId: 1,
  isOwn: false,
  canEdit: false,
  shares: [],
  mother: null,
  mother_freitext: null,
  father: { id: null, name: 'Balu' },
  father_freitext: null,
  children: [],
  housemates: [],
  bei_uns_seit: '2021-06-12',
  bei_uns_bis: null,
  abschied_grund: null,
  herkunft_art: 'tierheim',
  herkunft_text: 'Tierheim Sonnenhang'
})

const entryWithComments = () => ({
  id: 5,
  dog_id: 10,
  autor_name: 'Zuhause am Deich',
  datum: '2021-06-13',
  titel: 'Nele zieht ein',
  text: 'Die ersten Tage',
  foto_urls: [],
  privat: 0,
  comments: [
    { id: 100, family_id: 2, autor_name: 'Nachbar', text: 'Süß!', created_at: '2024-01-01T00:00:00.000Z', vonMir: true, ehemalig: false },
    { id: 101, family_id: 1, autor_name: 'Zuhause am Deich', text: 'Danke', created_at: '2024-01-02T00:00:00.000Z', vonMir: false, ehemalig: false }
  ]
})

async function render(family = activeFamily) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={['/tier/10']}>
        <Routes>
          <Route path="/tier/:id" element={<DogDetailPage family={family} onFamilyChange={() => {}} />} />
        </Routes>
      </MemoryRouter>
    )
  )
  return container
}

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
  getDog.mockReset()
  listTimeline.mockReset()
  listBreedingEvents.mockReset()
  listAllDogs.mockReset()
  addComment.mockReset()
  deleteComment.mockReset()
})

describe('ParentLink', () => {
  function renderParentLink(props) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(<MemoryRouter><ParentLink {...props} /></MemoryRouter>))
    return container
  }

  test('ein sichtbarer Elternteil (mit id) ist ein Link zur Tierseite', () => {
    renderParentLink({ parent: { id: 7, name: 'Aiko vom Sonnenhang' } })
    const link = container.querySelector('a')
    expect(link).not.toBeNull()
    expect(link.getAttribute('href')).toBe('/tier/7')
    expect(link.textContent).toContain('Aiko')
  })

  test('ein nicht sichtbarer Elternteil ({id:null,name}) ist ein einfacher Chip, kein Link auf /tier/null', () => {
    renderParentLink({ parent: { id: null, name: 'Balu' } })
    expect(container.querySelector('a')).toBeNull()
    const chip = container.querySelector('.chip')
    expect(chip).not.toBeNull()
    expect(chip.tagName).toBe('SPAN')
    expect(chip.textContent).toContain('Balu')
  })

  test('ganz ohne Elternteil zeigt Freitext oder "unbekannt"', () => {
    renderParentLink({ parent: null, freitext: null })
    expect(container.querySelector('.chip')).toBeNull()
    expect(container.textContent).toContain('unbekannt')
  })
})

describe('DogDetailPage – geteiltes Tier: Kommentare bleiben sichtbar', () => {
  test('Kommentare und das Kommentieren-Formular erscheinen, obwohl das Tier nicht dem aktiven Bereich gehört', async () => {
    getDog.mockResolvedValue(sharedDog())
    listTimeline.mockResolvedValue([entryWithComments()])
    listBreedingEvents.mockResolvedValue([])
    listAllDogs.mockResolvedValue([])

    await render()

    expect(container.querySelector('.reply-text')).not.toBeNull()
    const replies = [...container.querySelectorAll('.reply-text')].map((el) => el.textContent)
    expect(replies).toEqual(['Süß!', 'Danke'])
    expect(container.querySelector('.reply-open')).not.toBeNull()
  })

  test('in einer Familie erscheint der Löschen-Knopf als Mitglied nur für eigene Kommentare (vonMir)', async () => {
    getDog.mockResolvedValue(sharedDog())
    listTimeline.mockResolvedValue([entryWithComments()])
    listBreedingEvents.mockResolvedValue([])
    listAllDogs.mockResolvedValue([])

    await render()

    const replies = [...container.querySelectorAll('.reply')]
    const own = replies.find((li) => li.querySelector('.reply-text').textContent === 'Süß!') // vonMir
    const foreign = replies.find((li) => li.querySelector('.reply-text').textContent === 'Danke') // fremd, Rolle nur Mitglied

    expect(own.querySelector('.reply-delete')).not.toBeNull()
    expect(foreign.querySelector('.reply-delete')).toBeNull()
  })

  test('auch auf einem Tier der Familie bleibt es als Mitglied bei den eigenen Kommentaren - Moderation erst ab Stellvertretung', async () => {
    const ownDog = { ...sharedDog(), isOwn: true, canEdit: true, ownerFamilyId: 2 }
    getDog.mockResolvedValue(ownDog)
    listTimeline.mockResolvedValue([entryWithComments()])
    listBreedingEvents.mockResolvedValue([])
    listAllDogs.mockResolvedValue([])

    await render()
    expect(container.querySelectorAll('.reply-delete').length).toBe(1)

    act(() => root.unmount())
    root = null
    container.remove()
    await render({ ...activeFamily, role: 'stellvertretung' })
    expect(container.querySelectorAll('.reply-delete').length).toBe(2)
  })

  test('außerhalb einer Familie (eigenes Tierheim) gilt wie bisher: eigener Bereich oder eigener Eintrag', async () => {
    const shelter = { id: 2, name: 'Tierheim Birkenweg', theme: 'standard', art: 'tierheim', isDemo: false, home: { id: 2, art: 'tierheim' }, memberships: [] }
    getDog.mockResolvedValue({ ...sharedDog(), isOwn: true, canEdit: true, ownerFamilyId: 2 })
    listTimeline.mockResolvedValue([entryWithComments()])
    listBreedingEvents.mockResolvedValue([])
    listAllDogs.mockResolvedValue([])

    await render(shelter)

    expect(container.querySelectorAll('.reply-delete').length).toBe(2)
  })
})

describe('DogDetailPage – Hero-Zeile für geteilte Tiere', () => {
  test('zeigt "Im {familyName} seit …" statt "Bei euch seit …"', async () => {
    getDog.mockResolvedValue(sharedDog())
    listTimeline.mockResolvedValue([])
    listBreedingEvents.mockResolvedValue([])
    listAllDogs.mockResolvedValue([])

    await render()

    const companion = container.querySelector('.dog-hero-companion')
    expect(companion.textContent.trim()).toBe('Im Zuhause am Deich seit 12. Juni 2021 · aus dem Tierheim Sonnenhang')
  })
})

// Phase U: im Standard-Auftritt "Familienbande" und "Verpaarung", im Berner-Auftritt weiter "Stammbaum" und "Deckakt".
describe('DogDetailPage – Wörter je Auftritt', () => {
  const breeding = [{ id: 1, mutter_dog_id: 10, mutter_name: 'Nele', vater_dog_id: null, vater_freitext: 'Balu', datum: '2022-01-10', foto_urls: [] }]

  async function renderThemed(themeId) {
    getDog.mockResolvedValue(sharedDog())
    listTimeline.mockResolvedValue([])
    listBreedingEvents.mockResolvedValue(breeding)
    listAllDogs.mockResolvedValue([])
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/tier/10']}>
          <ThemeProvider themeId={themeId}>
            <Routes>
              <Route path="/tier/:id" element={<DogDetailPage family={activeFamily} onFamilyChange={() => {}} />} />
            </Routes>
          </ThemeProvider>
        </MemoryRouter>
      )
    )
  }

  test('Standard: Zurück-Link "Familienbande", Meilenstein "Verpaarung mit Balu", kein "Stammbaum"/"Deckakt"', async () => {
    await renderThemed('standard')

    expect(container.querySelector('.back-link').textContent.trim()).toBe('Familienbande')
    expect(container.textContent).toContain('Verpaarung mit Balu')
    expect(container.textContent).not.toMatch(/Stammbaum|Deckakt/)
  })

  test('Berner: Zurück-Link "Stammbaum", Meilenstein "Deckakt mit Balu"', async () => {
    await renderThemed('berner')

    expect(container.querySelector('.back-link').textContent.trim()).toBe('Stammbaum')
    expect(container.textContent).toContain('Deckakt mit Balu')
  })
})
