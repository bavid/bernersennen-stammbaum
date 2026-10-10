// @vitest-environment jsdom
// Einstieg „Als Fotobuch drucken“ im Reiter Chronik (DogChronicle): nur, wenn sichtbare Erinnerungen da sind.
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
vi.mock('../../api', () => ({ api: { getDog, listTimeline, listBreedingEvents, listAllDogs, takeOverDog } }))

import DogDetailPage from '../../pages/DogDetailPage.jsx'
import { ThemeProvider } from '../../themes/ThemeProvider.jsx'
import { DemoProvider } from '../../lib/demo.js'
import { setLang } from '../../lib/i18n/index.js'

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

const entry = () => ({ id: 5, dog_id: 10, autor_name: 'Familie Sonnenhang', datum: '2021-06-13', titel: 'Wilma zieht ein', text: 'Die ersten Tage', foto_urls: [], privat: 0, comments: [] })

async function render(family) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={['/tier/10']}>
        <ThemeProvider themeId="standard">
          <DemoProvider value={false}>
            <Routes>
              <Route path="/tier/:id" element={<DogDetailPage family={family} onFamilyChange={() => {}} />} />
            </Routes>
          </DemoProvider>
        </ThemeProvider>
      </MemoryRouter>
    )
  )
}

function mockLoad(entries) {
  getDog.mockResolvedValue(familyDog())
  listTimeline.mockResolvedValue(entries)
  listBreedingEvents.mockResolvedValue([])
  listAllDogs.mockResolvedValue([])
}

const bookLink = () => container.querySelector('a[href="/tier/10/fotobuch"]')

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  setLang('de')
  delete document.documentElement.dataset.theme
  for (const mock of [getDog, listTimeline, listBreedingEvents, listAllDogs, takeOverDog]) mock.mockReset()
})

describe('Chronik – Als Fotobuch drucken', () => {
  test('mit sichtbaren Erinnerungen auch für Gäste (nur lesen)', async () => {
    mockLoad([entry()])
    await render(familyAs('gast'))
    expect(bookLink().textContent).toContain('Als Fotobuch drucken')
  })

  test('ohne sichtbare Erinnerungen kein Einstieg', async () => {
    mockLoad([])
    await render(familyAs('mitglied'))
    expect(bookLink()).toBeNull()
  })

  test('englisch', async () => {
    setLang('en')
    mockLoad([entry()])
    await render(familyAs('mitglied'))
    expect(bookLink().textContent).toContain('Print as photo book')
  })
})
