// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { listDogs, createDog, schuetzlinge } = vi.hoisted(() => ({
  listDogs: vi.fn(),
  createDog: vi.fn(),
  schuetzlinge: vi.fn()
}))
vi.mock('../api', () => ({ api: { listDogs, createDog, schuetzlinge } }))

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

function Where() {
  const location = useLocation()
  return (
    <output data-testid="where" data-from={location.state?.from ?? ''}>
      {`${location.pathname}${location.search}`}
    </output>
  )
}

async function render(url = '/tiere') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[url]}>
        <ShelterAnimalsPage family={family} />
        <Where />
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
  schuetzlinge.mockReset()
})

beforeEach(() => {
  schuetzlinge.mockResolvedValue({ items: [] })
})

function chip(label) {
  return [...container.querySelectorAll('.filter-chip')].find((btn) => btn.textContent.startsWith(label))
}

describe('ShelterAnimalsPage – "Unsere Tiere"', () => {
  // V-Fehler 2: "Vermittelt" und ganz rechts "Ehemalige (mitgelesen)" zeigten sinngemäß dasselbe (ein vermitteltes
  // Tier ist ein Ehemaliges) - jetzt ein Chip je Funktion.
  test('zeigt sechs Filter-Chips, jede Ansicht genau einmal: Alle, Verfügbar, Reserviert, Pausiert, Vermittelt, Ohne Status', async () => {
    listDogs.mockResolvedValue([
      dog({ id: 1, vermittlung_status: 'in_vermittlung' }),
      dog({ id: 2, vermittlung_status: 'reserviert' }),
      dog({ id: 3, vermittlung_status: 'pausiert' }),
      dog({ id: 4, vermittlung_status: 'vermittelt' }),
      dog({ id: 5, vermittlung_status: null })
    ])
    await render()

    const labels = [...container.querySelectorAll('.filter-chip')].map((btn) => btn.textContent.split(' ·')[0])
    expect(labels).toEqual(['Alle', 'Verfügbar', 'Reserviert', 'Pausiert', 'Vermittelt', 'Ohne Status'])
  })

  // Audit W (N10): ein Chip mit „· 0“ sagt nichts - er bleibt weg; „Alle“ und der gewählte Filter stehen immer da.
  test('Chips ohne Tiere bleiben weg - außer „Alle“ und dem gewählten Filter', async () => {
    listDogs.mockResolvedValue([dog({ id: 1, vermittlung_status: 'in_vermittlung' }), dog({ id: 2, vermittlung_status: 'vermittelt' })])
    await render()
    const labels = () => [...container.querySelectorAll('.filter-chip')].map((btn) => btn.textContent.split(' ·')[0])
    expect(labels()).toEqual(['Alle', 'Verfügbar', 'Vermittelt'])

    act(() => chip('Vermittelt').click())
    expect(labels()).toEqual(['Alle', 'Verfügbar', 'Vermittelt'])
  })

  test('ohne Tiere nur „Alle“ und der gewählte Filter; ein Filter aus der Adresse bleibt sichtbar', async () => {
    listDogs.mockResolvedValue([])
    await render('/tiere?status=ohne_status')
    const labels = [...container.querySelectorAll('.filter-chip')].map((btn) => btn.textContent.split(' ·')[0])
    expect(labels).toEqual(['Alle', 'Ohne Status'])
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

  test('"Ohne Status" zeigt eigene Tiere ohne vermittlung_status, keine mitgelesenen Ehemaligen', async () => {
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

  test('"Vermittelt" zeigt vermittelte eigene Tiere und die mitgelesenen Ehemaligen, sonst nichts', async () => {
    listDogs.mockResolvedValue([
      dog({ id: 1, name: 'Pepper', vermittlung_status: 'in_vermittlung' }),
      dog({ id: 2, name: 'Benno', vermittlung_status: 'vermittelt' }),
      dog({ id: 3, name: 'Nele', vermittlung_status: null, shared_from: 'Zuhause am Deich' }),
      dog({ id: 4, name: 'Findus', vermittlung_status: null, shared_from: null })
    ])
    await render()

    expect(chip('Vermittelt').textContent).toContain('· 2')
    act(() => chip('Vermittelt').click())

    expect(container.textContent).toContain('Benno')
    expect(container.textContent).toContain('Nele')
    expect(container.textContent).not.toContain('Pepper')
    expect(container.textContent).not.toContain('Findus')
  })

  test('ein mitgelesenes Tier trägt den Status "Vermittelt" und nennt sein neues Zuhause', async () => {
    listDogs.mockResolvedValue([dog({ id: 3, name: 'Nele', vermittlung_status: null, shared_from: 'Zuhause am Deich' })])
    await render()

    act(() => chip('Vermittelt').click())

    const card = container.querySelector('.shelter-card')
    expect(card.querySelector('.status-chip').textContent).toBe('Vermittelt')
    expect(card.textContent).toContain('Ihr lest mit · Zuhause am Deich')
    expect(card.textContent).not.toContain('Steckbrief')
  })

  test('ein mitgelesenes Tier führt mit „Neuigkeiten“ in seine Chronik', async () => {
    listDogs.mockResolvedValue([dog({ id: 3, name: 'Nele', vermittlung_status: null, shared_from: 'Zuhause am Deich' }), dog({ id: 4, name: 'Benno', vermittlung_status: 'vermittelt' })])
    await render('/tiere?status=vermittelt')

    const cards = [...container.querySelectorAll('.shelter-card')]
    const nele = cards.find((card) => card.textContent.includes('Nele'))
    expect(nele.getAttribute('href')).toBe('/tier/3?reiter=chronik')
    expect(nele.querySelector('.shelter-card-news').textContent).toBe('Neuigkeiten')
    // ein eigenes (nicht mitgelesenes) Tier hat keine Neuigkeiten von dort
    const benno = cards.find((card) => card.textContent.includes('Benno'))
    expect(benno.getAttribute('href')).toBe('/tier/4')
    expect(benno.querySelector('.shelter-card-news')).toBeNull()

    // „Zurück“ auf der Tierseite führt wieder in denselben Filter
    act(() => nele.click())
    const where = container.querySelector('[data-testid="where"]')
    expect(where.textContent).toBe('/tier/3?reiter=chronik')
    expect(where.dataset.from).toBe('/tiere?status=vermittelt')
  })

  test('der Filter steht in der Adresse (?status=…) - ohne Angabe „Verfügbar“', async () => {
    listDogs.mockResolvedValue([dog({ id: 1, name: 'Pepper' }), dog({ id: 2, name: 'Oskar', vermittlung_status: 'reserviert' })])
    await render('/tiere?status=reserviert')
    expect(chip('Reserviert').getAttribute('aria-pressed')).toBe('true')
    expect(container.textContent).toContain('Oskar')
    act(() => chip('Alle').click())
    expect(container.querySelector('[data-testid="where"]').textContent).toBe('/tiere?status=alle')
    act(() => chip('Verfügbar').click())
    expect(container.querySelector('[data-testid="where"]').textContent).toBe('/tiere')
  })

  test('„So geht es euren Schützlingen“ steht oben; „Alle ansehen“ wählt „Vermittelt“', async () => {
    listDogs.mockResolvedValue([dog({ id: 1, name: 'Pepper' }), dog({ id: 3, name: 'Nele', vermittlung_status: null, shared_from: 'Zuhause am Deich' })])
    schuetzlinge.mockResolvedValue({
      items: [{ id: 7, dog: { id: 3, name: 'Nele', name_unbekannt: false, tierart: 'hund', foto_url: null }, titel: 'Am Deich', text: null, datum: '2026-09-12', foto_url: null, comment_count: 1 }]
    })
    await render()

    const section = container.querySelector('.ward-news')
    expect(section.querySelector('h2').textContent).toBe('So geht es euren Schützlingen')
    expect(section.compareDocumentPosition(container.querySelector('.filter-chips')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(section.querySelector('.ward-news-card').getAttribute('href')).toBe('/tier/3#entry-7')

    const all = [...section.querySelectorAll('button')].find((button) => button.textContent === 'Alle ansehen')
    act(() => all.click())
    expect(chip('Vermittelt').getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('[data-testid="where"]').textContent).toBe('/tiere?status=vermittelt')
    expect(document.activeElement).toBe(chip('Vermittelt'))
    expect(container.querySelector('.shelter-grid').textContent).toContain('Nele')
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
    const hund = [...container.querySelectorAll('.tierart-chip')].find((chip) => chip.textContent === 'Hund').querySelector('input')
    act(() => hund.click())

    const nameInput = container.querySelector('.quick-animal-form [name="name"]')
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

  test('die Karten zeigen "Verfügbar" und "Pausiert" als Status', async () => {
    listDogs.mockResolvedValue([
      dog({ id: 1, name: 'Pepper', vermittlung_status: 'in_vermittlung' }),
      dog({ id: 2, name: 'Oskar', vermittlung_status: 'pausiert' })
    ])
    await render()

    act(() => chip('Alle').click())

    const statusChips = [...container.querySelectorAll('.status-chip')].map((el) => el.textContent)
    expect(statusChips).toEqual(['Verfügbar', 'Pausiert'])
  })
})
