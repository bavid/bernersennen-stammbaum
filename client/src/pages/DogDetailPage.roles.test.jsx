// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { getDog, listTimeline, listBreedingEvents, listAllDogs, takeOverDog } = vi.hoisted(() => ({
  getDog: vi.fn(),
  listTimeline: vi.fn(),
  listBreedingEvents: vi.fn(),
  listAllDogs: vi.fn(),
  takeOverDog: vi.fn()
}))
vi.mock('../api', () => ({ api: { getDog, listTimeline, listBreedingEvents, listAllDogs, takeOverDog } }))

import DogDetailPage from './DogDetailPage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'
import { DemoProvider } from '../lib/demo.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close() {
    this.open = false
  }
}

let container
let root

const home = { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause' }
// Haushalt 1 in Familie Sonnenhang (aktiver Bereich 2) mit Rolle role
const familyAs = (role) => ({
  id: 2,
  name: 'Familie Sonnenhang',
  theme: 'standard',
  art: 'rudel',
  isDemo: false,
  role,
  home,
  memberships: [{ id: 2, name: 'Familie Sonnenhang', theme: 'standard', rolle: role }]
})

// Wilma gehört der Familie selbst (isOwn/canEdit aus Sicht des aktiven Bereichs).
const familyDog = () => ({
  id: 10,
  name: 'Wilma',
  name_unbekannt: false,
  tierart: 'hund',
  geschlecht: 'huendin',
  geburtsdatum: '2019-03-10',
  rasse: 'Mischling',
  farbe_markings: null,
  beschreibung: null,
  foto_url: null,
  familyName: 'Familie Sonnenhang',
  ownerFamilyId: 2,
  isOwn: true,
  canEdit: true,
  shares: [],
  mother: null,
  mother_freitext: null,
  father: null,
  father_freitext: null,
  children: [],
  housemates: [],
  bei_uns_seit: null,
  bei_uns_bis: null,
  abschied_grund: null,
  herkunft_art: null,
  herkunft_text: null
})

const entry = () => ({
  id: 5,
  dog_id: 10,
  autor_name: 'Familie Sonnenhang',
  datum: '2021-06-13',
  titel: 'Wilma zieht ein',
  text: 'Die ersten Tage',
  foto_urls: [],
  privat: 0,
  comments: [
    { id: 100, family_id: 2, autor_name: 'Benno', text: 'Süß!', created_at: '2024-01-01T00:00:00.000Z', vonMir: true, ehemalig: false },
    { id: 101, family_id: 2, autor_name: 'Pepper', text: 'Danke', created_at: '2024-01-02T00:00:00.000Z', vonMir: false, ehemalig: true }
  ]
})

async function render(family, { isDemo = false } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={['/tier/10']}>
        <ThemeProvider themeId="standard">
          <DemoProvider value={isDemo}>
            <Routes>
              <Route path="/tier/:id" element={<DogDetailPage family={family} onFamilyChange={() => {}} />} />
            </Routes>
          </DemoProvider>
        </ThemeProvider>
      </MemoryRouter>
    )
  )
  return container
}

function mockLoad(dog = familyDog()) {
  getDog.mockResolvedValue(dog)
  listTimeline.mockResolvedValue([entry()])
  listBreedingEvents.mockResolvedValue([])
  listAllDogs.mockResolvedValue([])
}

const buttons = () => [...container.querySelectorAll('button')]
const buttonWith = (text) => buttons().find((btn) => btn.textContent.includes(text))

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  delete document.documentElement.dataset.theme
  document.title = ''
  for (const mock of [getDog, listTimeline, listBreedingEvents, listAllDogs, takeOverDog]) mock.mockReset()
})

describe('DogDetailPage – Rechte je Rolle auf einem Tier der Familie', () => {
  test('Gast: weder Erinnerung schreiben noch Bearbeiten oder Eintrag ändern - Kommentieren geht, eigene Kommentare löschen auch', async () => {
    mockLoad()
    await render(familyAs('gast'))

    expect(container.querySelector('#composer')).toBeNull()
    expect(buttonWith('Erinnerung hinzufügen')).toBeUndefined()
    expect(buttonWith('Bearbeiten')).toBeUndefined()
    expect(container.querySelector('[aria-label="„Wilma zieht ein“ bearbeiten"]')).toBeNull()
    expect(container.querySelector('.reply-open')).not.toBeNull()
    const replies = [...container.querySelectorAll('.reply')]
    expect(replies[0].querySelector('.reply-delete')).not.toBeNull() // vonMir
    expect(replies[1].querySelector('.reply-delete')).toBeNull()
    expect(container.querySelector('.take-over-panel')).toBeNull()
  })

  test('Mitglied: schreibt und bearbeitet, löscht aber weder fremde Kommentare noch das Tier', async () => {
    mockLoad()
    await render(familyAs('mitglied'))

    expect(container.querySelector('#composer')).not.toBeNull()
    expect(buttonWith('Erinnerung hinzufügen')).not.toBeUndefined()
    expect(container.querySelectorAll('.reply-delete')).toHaveLength(1)

    await act(async () => buttonWith('Bearbeiten').click())
    const form = container.querySelector('.modal[open] form')
    expect(form).not.toBeNull()
    expect([...form.querySelectorAll('button')].some((b) => b.textContent.includes('löschen'))).toBe(false)
  })

  test('Stellvertretung: löscht fremde Kommentare und das Tier der Familie', async () => {
    mockLoad()
    await render(familyAs('stellvertretung'))

    expect(container.querySelectorAll('.reply-delete')).toHaveLength(2)
    await act(async () => buttonWith('Bearbeiten').click())
    const form = container.querySelector('.modal[open] form')
    expect([...form.querySelectorAll('button')].some((b) => b.textContent.includes('löschen'))).toBe(true)
    expect(container.querySelector('.take-over-panel')).toBeNull()
  })

  test('Kommentare eines Haushalts, der nicht mehr Mitglied ist, tragen "ehemaliges Mitglied"', async () => {
    mockLoad()
    await render(familyAs('gast'))

    const replies = [...container.querySelectorAll('.reply')]
    expect(replies[0].querySelector('.reply-former')).toBeNull()
    expect(replies[1].querySelector('.reply-former').textContent).toBe('ehemaliges Mitglied')
    expect(replies[1].querySelector('.reply-meta').textContent).toContain('Pepper')
  })

  test('ein Tier eines anderen Haushalts (hierher geteilt) bleibt auch für Mitglieder nur lesbar', async () => {
    mockLoad({ ...familyDog(), isOwn: false, canEdit: false, ownerFamilyId: 7, familyName: 'Haus Birkenweg' })
    await render(familyAs('mitglied'))
    expect(container.querySelector('#composer')).toBeNull()
    expect(container.textContent).toContain('Lebt im Zuhause „Haus Birkenweg“ und wird hier geteilt.')
  })
})

describe('DogDetailPage – zu Besuch in einem anderen Zuhause (Phase V2)', () => {
  const visitor = {
    id: 9,
    name: 'Zuhause Möwenweg',
    theme: 'standard',
    art: 'zuhause',
    isDemo: false,
    role: 'gast',
    zuBesuch: true,
    home,
    memberships: [],
    besuche: [{ id: 9, name: 'Zuhause Möwenweg' }]
  }

  test('nur ansehen und kommentieren: kein Schreiben, kein zweiter Besuchs-Hinweis (steht im Band), nur eigene Kommentare löschbar', async () => {
    mockLoad({ ...familyDog(), isOwn: false, canEdit: false, ownerFamilyId: 9, familyName: 'Zuhause Möwenweg' })
    await render(visitor)
    expect(container.querySelector('#composer')).toBeNull()
    expect(buttonWith('Bearbeiten')).toBeUndefined()
    expect(container.textContent).not.toContain('zu Besuch bei')
    expect(container.querySelector('.notice')).toBeNull()
    expect(container.textContent).not.toContain('wird hier geteilt')
    expect(container.querySelector('.reply-open')).not.toBeNull()
    const replies = [...container.querySelectorAll('.reply')]
    expect(replies[0].querySelector('.reply-delete')).not.toBeNull()
    expect(replies[1].querySelector('.reply-delete')).toBeNull()
    expect(container.querySelector('.share-panel')).toBeNull()
  })
})

describe('DogDetailPage – „In meine Chronik übernehmen“ (Leitung mit eigenem Zuhause)', () => {
  test('erscheint für die Leitung auf einem Tier der Familie, erklärt Umzug und Sichtbarkeit, zweistufig → api.takeOverDog, dann neu laden', async () => {
    mockLoad()
    takeOverDog.mockResolvedValue({})
    await render(familyAs('leitung'))

    const panel = container.querySelector('.take-over-panel')
    expect(panel).not.toBeNull()
    expect(panel.textContent).toContain('zieht Wilma mit allen Einträgen zu dir um')
    expect(panel.textContent).toContain('bleibt hier als geteiltes Tier sichtbar')
    const button = () => panel.querySelector('button')
    expect(button().textContent).toContain('In meine Chronik übernehmen')

    act(() => button().click())
    expect(button().textContent).toContain('Ja, in meine Chronik übernehmen')
    expect(takeOverDog).not.toHaveBeenCalled()

    getDog.mockResolvedValue({ ...familyDog(), isOwn: false, canEdit: false, ownerFamilyId: 1, familyName: 'Zuhause am Deich' })
    await act(async () => button().click())
    expect(takeOverDog).toHaveBeenCalledWith(10)
    expect(getDog).toHaveBeenCalledTimes(2)
    expect(container.querySelector('.take-over-panel')).toBeNull()
    expect(container.textContent).toContain('Lebt im Zuhause „Zuhause am Deich“ und wird hier geteilt.')
  })

  test('nicht mit dem gemeinsamen Schlüssel (kein eigenes Zuhause) und nicht auf einem Tier eines anderen Haushalts', async () => {
    mockLoad()
    await render({ ...familyAs('leitung'), home: { id: 2, name: 'Familie Sonnenhang', theme: 'standard', art: 'rudel' }, memberships: [] })
    expect(container.querySelector('.take-over-panel')).toBeNull()

    act(() => root.unmount())
    root = null
    container.remove()
    mockLoad({ ...familyDog(), isOwn: false, canEdit: false, ownerFamilyId: 7 })
    await render(familyAs('leitung'))
    expect(container.querySelector('.take-over-panel')).toBeNull()
  })

  test('kannUebernehmen vom Server hat Vorrang vor der Client-Regel', async () => {
    mockLoad({ ...familyDog(), kannUebernehmen: false })
    await render(familyAs('leitung'))
    expect(container.querySelector('.take-over-panel')).toBeNull()
  })

  test('in der Demo gesperrt, mit Hinweis', async () => {
    mockLoad()
    await render(familyAs('leitung'), { isDemo: true })
    const panel = container.querySelector('.take-over-panel')
    expect(panel.querySelector('button').disabled).toBe(true)
    expect(panel.textContent).toContain('In der Demo nicht möglich.')
  })

  test('ein Fehler des Servers erscheint im Panel', async () => {
    mockLoad()
    takeOverDog.mockRejectedValue(new Error('Übernehmen geht nur als Mitglied mit eigener Chronik („Meine Chronik“)'))
    await render(familyAs('leitung'))
    const button = () => container.querySelector('.take-over-panel button')
    act(() => button().click())
    await act(async () => button().click())
    expect(container.querySelector('.take-over-panel [role="alert"]').textContent).toContain('Übernehmen geht nur')
    expect(button().textContent).toBe('In meine Chronik übernehmen')
  })
})
