// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { getDog, listTimeline, listBreedingEvents, listAllDogs, setShelterShare } = vi.hoisted(() => ({
  getDog: vi.fn(),
  listTimeline: vi.fn(),
  listBreedingEvents: vi.fn(),
  listAllDogs: vi.fn(),
  setShelterShare: vi.fn()
}))

vi.mock('../api', () => ({
  api: { getDog, listTimeline, listBreedingEvents, listAllDogs, setShelterShare }
}))

import DogDetailPage from './DogDetailPage.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const homeFamily = {
  id: 1,
  name: 'Zuhause am Deich',
  theme: 'standard',
  art: 'zuhause',
  isDemo: false,
  home: { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause' },
  memberships: []
}

const homeDog = (overrides = {}) => ({
  id: 30,
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
  isOwn: true,
  canEdit: true,
  shares: [],
  mother: null,
  mother_freitext: null,
  father: null,
  father_freitext: null,
  children: [],
  housemates: [],
  bei_uns_seit: '2021-06-12',
  bei_uns_bis: null,
  abschied_grund: null,
  herkunft_art: 'tierheim',
  herkunft_text: 'Tierheim Sonnenhang',
  shelterShare: null,
  ...overrides
})

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={['/tier/30']}>
        <Routes>
          <Route path="/tier/:id" element={<DogDetailPage family={homeFamily} onFamilyChange={() => {}} />} />
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
  setShelterShare.mockReset()
})

describe('DogDetailPage – Einwilligung "Tierheim darf mitlesen"', () => {
  test('zeigt die Tierheim-Sektion, wenn dog.shelterShare gesetzt ist', async () => {
    getDog.mockResolvedValue(homeDog({ shelterShare: { shelterName: 'Tierheim Sonnenhang', enabled: true, storyConsent: false } }))
    listTimeline.mockResolvedValue([])
    listBreedingEvents.mockResolvedValue([])
    listAllDogs.mockResolvedValue([])
    await render()

    expect(container.querySelector('.shelter-share-panel')).not.toBeNull()
    expect(container.textContent).toContain('Tierheim Sonnenhang darf mitlesen')
  })

  test('ohne shelterShare (kein Tierheim-Ursprung) erscheint die Sektion gar nicht', async () => {
    getDog.mockResolvedValue(homeDog({ shelterShare: null }))
    listTimeline.mockResolvedValue([])
    listBreedingEvents.mockResolvedValue([])
    listAllDogs.mockResolvedValue([])
    await render()

    expect(container.querySelector('.shelter-share-panel')).toBeNull()
  })
})
