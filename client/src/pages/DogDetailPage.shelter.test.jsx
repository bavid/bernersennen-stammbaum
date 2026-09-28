// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { getDog, listTimeline, listBreedingEvents, listAllDogs, updateDog, setSteckbrief, createHandover, withdrawHandover } = vi.hoisted(
  () => ({
    getDog: vi.fn(),
    listTimeline: vi.fn(),
    listBreedingEvents: vi.fn(),
    listAllDogs: vi.fn(),
    updateDog: vi.fn(),
    setSteckbrief: vi.fn(),
    createHandover: vi.fn(),
    withdrawHandover: vi.fn()
  })
)

vi.mock('../api', () => ({
  api: { getDog, listTimeline, listBreedingEvents, listAllDogs, updateDog, setSteckbrief, createHandover, withdrawHandover }
}))

import DogDetailPage from './DogDetailPage.jsx'
import { DemoProvider } from '../lib/demo.js'

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

async function render({ isDemo = false } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <DemoProvider value={isDemo}>
        <MemoryRouter initialEntries={['/tier/20']}>
          <Routes>
            <Route path="/tier/:id" element={<DogDetailPage family={shelterFamily} onFamilyChange={() => {}} />} />
          </Routes>
        </MemoryRouter>
      </DemoProvider>
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
  withdrawHandover.mockReset()
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

  test('Ändern der Auswahl speichert NICHT sofort (kein onChange-Save) - erst "Speichern" ruft api.updateDog auf', async () => {
    getDog.mockResolvedValue(shelterDog())
    listTimeline.mockResolvedValue([])
    listBreedingEvents.mockResolvedValue([])
    listAllDogs.mockResolvedValue([])
    updateDog.mockResolvedValue({ ...shelterDog(), vermittlung_status: 'vermittelt' })
    await render()

    const select = container.querySelector('#vermittlung-status')
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
    await act(async () => {
      nativeSetter.call(select, 'vermittelt')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(updateDog).not.toHaveBeenCalled()

    const saveButton = [...container.querySelectorAll('.vermittlung-status-panel button')].find((btn) => btn.textContent === 'Speichern')
    expect(saveButton).not.toBeUndefined()
    await act(async () => saveButton.click())

    expect(updateDog).toHaveBeenCalledWith(20, { vermittlungStatus: 'vermittelt' })
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
  test('"Vermittelt – Übergabe vorbereiten" öffnet zuerst nur die Erklärung, ohne sofort einen Gutschein anzulegen', async () => {
    getDog.mockResolvedValue(shelterDog())
    listTimeline.mockResolvedValue([])
    listBreedingEvents.mockResolvedValue([])
    listAllDogs.mockResolvedValue([])
    await render()

    const trigger = [...container.querySelectorAll('button')].find((btn) => btn.textContent.includes('Übergabe vorbereiten'))
    await act(async () => trigger.click())

    expect(createHandover).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Es wird ein Übergabe-Gutschein erzeugt')
  })

  test('erst der Knopf "Übergabe-Gutschein erzeugen" im Dialog ruft api.createHandover auf und zeigt den Code', async () => {
    getDog.mockResolvedValue(shelterDog())
    listTimeline.mockResolvedValue([])
    listBreedingEvents.mockResolvedValue([])
    listAllDogs.mockResolvedValue([])
    createHandover.mockResolvedValue({ code: 'ABCD-1234-EFGH', link: '/v#ABCD1234EFGH' })
    await render()

    const trigger = [...container.querySelectorAll('button')].find((btn) => btn.textContent.includes('Übergabe vorbereiten'))
    await act(async () => trigger.click())
    const confirm = [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'Übergabe-Gutschein erzeugen')
    await act(async () => confirm.click())

    expect(createHandover).toHaveBeenCalledWith(20)
    expect(container.querySelector('.handover-code').textContent).toBe('ABCD-1234-EFGH')
  })

  test('kein "Übergabe zurückziehen" bei Status "in Vermittlung"', async () => {
    getDog.mockResolvedValue(shelterDog({ vermittlung_status: 'in_vermittlung' }))
    listTimeline.mockResolvedValue([])
    listBreedingEvents.mockResolvedValue([])
    listAllDogs.mockResolvedValue([])
    await render()

    expect([...container.querySelectorAll('button')].some((btn) => btn.textContent.includes('Übergabe zurückziehen'))).toBe(false)
  })

  test('bei Status "reserviert" ruft "Übergabe zurückziehen" api.withdrawHandover auf und übernimmt den neuen Status', async () => {
    getDog.mockResolvedValue(shelterDog({ vermittlung_status: 'reserviert' }))
    listTimeline.mockResolvedValue([])
    listBreedingEvents.mockResolvedValue([])
    listAllDogs.mockResolvedValue([])
    withdrawHandover.mockResolvedValue({ id: 20, vermittlung_status: 'in_vermittlung' })
    await render()

    const button = [...container.querySelectorAll('button')].find((btn) => btn.textContent.includes('Übergabe zurückziehen'))
    expect(button).not.toBeUndefined()
    await act(async () => button.click())

    expect(withdrawHandover).toHaveBeenCalledWith(20)
    const select = container.querySelector('#vermittlung-status')
    expect(select.value).toBe('in_vermittlung')
    // Der Knopf verschwindet, sobald der Status nicht mehr "reserviert" ist (dog-State neu gemischt).
    expect([...container.querySelectorAll('button')].some((btn) => btn.textContent.includes('Übergabe zurückziehen'))).toBe(false)
  })

  test('in der Demo ist "Übergabe zurückziehen" gesperrt, mit Hinweis (final-review Phase T Finding 8)', async () => {
    getDog.mockResolvedValue(shelterDog({ vermittlung_status: 'reserviert' }))
    listTimeline.mockResolvedValue([])
    listBreedingEvents.mockResolvedValue([])
    listAllDogs.mockResolvedValue([])
    await render({ isDemo: true })

    const button = [...container.querySelectorAll('button')].find((btn) => btn.textContent.includes('Übergabe zurückziehen'))
    expect(button.disabled).toBe(true)
    expect(container.textContent).toContain('In der Demo nicht möglich.')

    await act(async () => button.click())
    expect(withdrawHandover).not.toHaveBeenCalled()
  })
})

describe('DogDetailPage – Tierheim: Übergabe bei Status "pausiert" (Phase P)', () => {
  function handoverButton() {
    return [...container.querySelectorAll('button')].find((btn) => btn.textContent.includes('Übergabe vorbereiten'))
  }

  test('ein pausiertes Tier kann nicht übergeben werden - der Knopf ist gesperrt, mit Hinweis', async () => {
    getDog.mockResolvedValue(shelterDog({ vermittlung_status: 'pausiert' }))
    listTimeline.mockResolvedValue([])
    listBreedingEvents.mockResolvedValue([])
    listAllDogs.mockResolvedValue([])
    await render()

    expect(handoverButton().disabled).toBe(true)
    expect(container.textContent).toContain('Erst auf ‚Verfügbar‘ oder ‚Reserviert‘ setzen.')
  })

  test('bei "in Vermittlung" bleibt der Knopf frei und ohne Hinweis', async () => {
    getDog.mockResolvedValue(shelterDog({ vermittlung_status: 'in_vermittlung' }))
    listTimeline.mockResolvedValue([])
    listBreedingEvents.mockResolvedValue([])
    listAllDogs.mockResolvedValue([])
    await render()

    expect(handoverButton().disabled).toBe(false)
    expect(container.textContent).not.toContain('Erst auf ‚Verfügbar‘ oder ‚Reserviert‘ setzen.')
  })
})
