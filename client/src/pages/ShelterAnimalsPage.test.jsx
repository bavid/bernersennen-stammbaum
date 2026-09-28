// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { listDogs, createDog } = vi.hoisted(() => ({
  listDogs: vi.fn(),
  createDog: vi.fn()
}))
vi.mock('../api', () => ({ api: { listDogs, createDog } }))

import ShelterAnimalsPage from './ShelterAnimalsPage.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom implementiert <dialog> nicht vollständig (kein showModal/close) – das "Tier aufnehmen"-Modal
// ruft beides beim Öffnen/Schließen auf.
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

const family = { id: 1, name: 'Tierheim Sonnenhang', art: 'tierheim' }

const dog = (overrides = {}) => ({
  id: 1,
  name: 'Pepper',
  name_unbekannt: false,
  tierart: 'hund',
  geschlecht: 'huendin',
  vermittlung_status: 'in_vermittlung',
  public_slug: null,
  shared_from: null,
  ...overrides
})

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <ShelterAnimalsPage family={family} />
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
  listDogs.mockReset()
  createDog.mockReset()
})

function chip(label) {
  return [...container.querySelectorAll('.filter-chip')].find((btn) => btn.textContent.startsWith(label))
}

describe('ShelterAnimalsPage – "Unsere Tiere"', () => {
  test('zeigt sieben Filter-Chips: Alle, Verfügbar, Reserviert, Pausiert, Vermittelt, Ohne Status, Ehemalige (mitgelesen)', async () => {
    listDogs.mockResolvedValue([])
    await render()

    const labels = [...container.querySelectorAll('.filter-chip')].map((btn) => btn.textContent.split(' ·')[0])
    expect(labels).toEqual(['Alle', 'Verfügbar', 'Reserviert', 'Pausiert', 'Vermittelt', 'Ohne Status', 'Ehemalige (mitgelesen)'])
  })

  test('Standardfilter "Verfügbar" zeigt nur Tiere mit Status in_vermittlung', async () => {
    listDogs.mockResolvedValue([
      dog({ id: 1, name: 'Pepper', vermittlung_status: 'in_vermittlung' }),
      dog({ id: 2, name: 'Oskar', vermittlung_status: 'reserviert' })
    ])
    await render()

    expect(container.textContent).toContain('Pepper')
    expect(container.textContent).not.toContain('Oskar')
  })

  test('Umschalten auf "Reserviert" zeigt reservierte Tiere', async () => {
    listDogs.mockResolvedValue([
      dog({ id: 1, name: 'Pepper', vermittlung_status: 'in_vermittlung' }),
      dog({ id: 2, name: 'Oskar', vermittlung_status: 'reserviert' })
    ])
    await render()

    act(() => chip('Reserviert').click())

    expect(container.textContent).toContain('Oskar')
    expect(container.textContent).not.toContain('Pepper')
  })

  test('"Alle" zeigt jedes Tier, unabhängig vom Status', async () => {
    listDogs.mockResolvedValue([
      dog({ id: 1, name: 'Pepper', vermittlung_status: 'in_vermittlung' }),
      dog({ id: 2, name: 'Oskar', vermittlung_status: 'reserviert' }),
      dog({ id: 3, name: 'Nele', vermittlung_status: null, shared_from: 'Zuhause am Deich' }),
      dog({ id: 4, name: 'Findus', vermittlung_status: null, shared_from: null })
    ])
    await render()

    act(() => chip('Alle').click())

    expect(container.textContent).toContain('Pepper')
    expect(container.textContent).toContain('Oskar')
    expect(container.textContent).toContain('Nele')
    expect(container.textContent).toContain('Findus')
  })

  test('"Ohne Status" zeigt eigene Tiere ohne vermittlung_status, keine Ehemaligen', async () => {
    listDogs.mockResolvedValue([
      dog({ id: 1, name: 'Pepper', vermittlung_status: 'in_vermittlung' }),
      dog({ id: 4, name: 'Findus', vermittlung_status: null, shared_from: null }),
      dog({ id: 3, name: 'Nele', vermittlung_status: null, shared_from: 'Zuhause am Deich' })
    ])
    await render()

    act(() => chip('Ohne Status').click())

    expect(container.textContent).toContain('Findus')
    expect(container.textContent).not.toContain('Pepper')
    expect(container.textContent).not.toContain('Nele')
  })

  test('"Ehemalige (mitgelesen)" zeigt Tiere mit shared_from, nicht die eigenen', async () => {
    listDogs.mockResolvedValue([
      dog({ id: 1, name: 'Pepper', vermittlung_status: 'in_vermittlung' }),
      dog({ id: 3, name: 'Nele', vermittlung_status: null, shared_from: 'Zuhause am Deich' })
    ])
    await render()

    act(() => chip('Ehemalige').click())

    expect(container.textContent).toContain('Nele')
    expect(container.textContent).toContain('aus Zuhause am Deich')
    expect(container.textContent).not.toContain('Pepper')
  })

  test('eine Karte zeigt den Steckbrief-Status', async () => {
    listDogs.mockResolvedValue([dog({ public_slug: 'pepper-ab12cd' })])
    await render()

    expect(container.textContent).toContain('Steckbrief öffentlich')
  })

  test('eine Karte zeigt den neuesten Eintrag direkt aus dog.latest_entry_titel/latest_entry_datum (kein separater recentActivity-Aufruf)', async () => {
    listDogs.mockResolvedValue([dog({ latest_entry_titel: 'Erster Spaziergang', latest_entry_datum: '2026-03-04' })])
    await render()

    expect(container.textContent).toContain('Erster Spaziergang')
  })

  test('"Tier aufnehmen" öffnet die Schnellerfassung; ein angelegtes Tier bekommt vermittlungStatus in_vermittlung', async () => {
    listDogs.mockResolvedValue([])
    createDog.mockResolvedValue({ id: 9, name: 'Momo' })
    await render()

    const openButton = [...container.querySelectorAll('button')].find((btn) => btn.textContent.includes('Tier aufnehmen'))
    act(() => openButton.click())

    expect(container.querySelector('.quick-animal-form')).not.toBeNull()

    // Standard-Theme: keine Tierart vorausgewählt - ohne Auswahl bricht das Absenden mit Feldfehler ab.
    const hundButton = [...container.querySelectorAll('[aria-label="Tierart"] button')].find((btn) => btn.textContent === 'Hund')
    act(() => hundButton.click())

    const nameInput = container.querySelector('#quick-animal-name')
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    await act(async () => {
      nativeInputValueSetter.call(nameInput, 'Momo')
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => container.querySelector('.quick-animal-form').requestSubmit())

    expect(createDog).toHaveBeenCalledWith(expect.objectContaining({ vermittlungStatus: 'in_vermittlung' }))
  })
})

describe('ShelterAnimalsPage – Status "pausiert" (Phase P)', () => {
  test('der Chip "Pausiert" zeigt nur pausierte Tiere', async () => {
    listDogs.mockResolvedValue([
      dog({ id: 1, name: 'Pepper', vermittlung_status: 'in_vermittlung' }),
      dog({ id: 2, name: 'Oskar', vermittlung_status: 'pausiert' })
    ])
    await render()

    expect(chip('Pausiert').textContent).toContain('· 1')
    act(() => chip('Pausiert').click())

    expect(container.textContent).toContain('Oskar')
    expect(container.textContent).not.toContain('Pepper')
  })

  test('die Karten zeigen "Verfügbar" und "Pausiert (on hold)" als Status', async () => {
    listDogs.mockResolvedValue([
      dog({ id: 1, name: 'Pepper', vermittlung_status: 'in_vermittlung' }),
      dog({ id: 2, name: 'Oskar', vermittlung_status: 'pausiert' })
    ])
    await render()

    act(() => chip('Alle').click())

    const statusChips = [...container.querySelectorAll('.status-chip')].map((el) => el.textContent)
    expect(statusChips).toEqual(['Verfügbar', 'Pausiert (on hold)'])
  })
})
