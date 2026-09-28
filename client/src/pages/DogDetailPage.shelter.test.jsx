// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { getDog, listTimeline, listBreedingEvents, listAllDogs, updateDog, setSteckbrief, createHandover } = vi.hoisted(() => ({
  getDog: vi.fn(),
  listTimeline: vi.fn(),
  listBreedingEvents: vi.fn(),
  listAllDogs: vi.fn(),
  updateDog: vi.fn(),
  setSteckbrief: vi.fn(),
  createHandover: vi.fn()
}))

vi.mock('../api', () => ({
  api: { getDog, listTimeline, listBreedingEvents, listAllDogs, updateDog, setSteckbrief, createHandover }
}))

import DogDetailPage from './DogDetailPage.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom implementiert <dialog> nicht vollständig (kein showModal/close) – der Übergabe-Dialog läuft im Modal.
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

const shelterFamily = {
  id: 5,
  name: 'Tierheim Sonnenhang',
  theme: 'standard',
  art: 'tierheim',
  isDemo: false,
  home: { id: 5, name: 'Tierheim Sonnenhang', theme: 'standard', art: 'tierheim' },
  memberships: []
}

const shelterDog = (overrides = {}) => ({
  id: 20,
  name: 'Pepper',
  name_unbekannt: false,
  tierart: 'hund',
  geschlecht: 'huendin',
  geburtsdatum: null,
  rasse: 'Mischling',
  farbe_markings: null,
  beschreibung: null,
  foto_url: null,
  familyName: 'Tierheim Sonnenhang',
  ownerFamilyId: 5,
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
  herkunft_text: null,
  vermittlung_status: 'in_vermittlung',
  public_slug: null,
  ...overrides
})

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={['/tier/20']}>
        <Routes>
          <Route path="/tier/:id" element={<DogDetailPage family={shelterFamily} onFamilyChange={() => {}} />} />
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
  updateDog.mockReset()
  setSteckbrief.mockReset()
  createHandover.mockReset()
})

describe('DogDetailPage – Tierheim: Status', () => {
  test('zeigt die Status-Auswahl mit dem aktuellen Wert', async () => {
    getDog.mockResolvedValue(shelterDog())
    listTimeline.mockResolvedValue([])
    listBreedingEvents.mockResolvedValue([])
    listAllDogs.mockResolvedValue([])
    await render()

    const select = container.querySelector('#vermittlung-status')
    expect(select).not.toBeNull()
    expect(select.value).toBe('in_vermittlung')
  })

  test('Ändern der Auswahl ruft api.updateDog mit vermittlungStatus auf', async () => {
    getDog.mockResolvedValue(shelterDog())
    listTimeline.mockResolvedValue([])
    listBreedingEvents.mockResolvedValue([])
    listAllDogs.mockResolvedValue([])
    updateDog.mockResolvedValue({ ...shelterDog(), vermittlung_status: 'reserviert' })
    await render()

    const select = container.querySelector('#vermittlung-status')
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
    await act(async () => {
      nativeSetter.call(select, 'reserviert')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(updateDog).toHaveBeenCalledWith(20, { vermittlungStatus: 'reserviert' })
  })

  test('für ein nur geteiltes ("Ehemaliges") Tier erscheint keine Status-Auswahl', async () => {
    getDog.mockResolvedValue(shelterDog({ isOwn: false, canEdit: false, ownerFamilyId: 1, familyName: 'Zuhause am Deich' }))
    listTimeline.mockResolvedValue([])
    listBreedingEvents.mockResolvedValue([])
    listAllDogs.mockResolvedValue([])
    await render()

    expect(container.querySelector('#vermittlung-status')).toBeNull()
  })
})

describe('DogDetailPage – Tierheim: Steckbrief', () => {
  test('veröffentlicht der Steckbrief, erscheint der öffentliche Link', async () => {
    getDog.mockResolvedValue(shelterDog())
    listTimeline.mockResolvedValue([])
    listBreedingEvents.mockResolvedValue([])
    listAllDogs.mockResolvedValue([])
    setSteckbrief.mockResolvedValue({ id: 20, public_slug: 'pepper-ab12cd' })
    await render()

    const button = [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'Steckbrief veröffentlichen')
    await act(async () => button.click())

    expect(setSteckbrief).toHaveBeenCalledWith(20, true)
    expect(container.querySelector('.steckbrief-link').textContent).toContain('/t/pepper-ab12cd')
  })
})

describe('DogDetailPage – Tierheim: Übergabe', () => {
  test('"Vermittelt – Übergabe vorbereiten" öffnet den Dialog und zeigt den erzeugten Code', async () => {
    getDog.mockResolvedValue(shelterDog())
    listTimeline.mockResolvedValue([])
    listBreedingEvents.mockResolvedValue([])
    listAllDogs.mockResolvedValue([])
    createHandover.mockResolvedValue({ code: 'ABCD-1234-EFGH', link: '/v#ABCD1234EFGH' })
    await render()

    const trigger = [...container.querySelectorAll('button')].find((btn) => btn.textContent.includes('Übergabe vorbereiten'))
    await act(async () => trigger.click())

    expect(createHandover).toHaveBeenCalledWith(20)
    expect(container.querySelector('.handover-code').textContent).toBe('ABCD-1234-EFGH')
  })
})
