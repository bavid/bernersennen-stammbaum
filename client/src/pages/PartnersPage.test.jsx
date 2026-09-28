// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { publicPartners } = vi.hoisted(() => ({ publicPartners: vi.fn() }))
vi.mock('../api', () => ({ api: { publicPartners } }))

import PartnersPage from './PartnersPage.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

function setInputValue(input, value) {
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
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
  publicPartners.mockReset()
})

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <PartnersPage />
      </MemoryRouter>
    )
  )
  return container
}

const sonnenhang = {
  id: 1,
  slug: 'tierheim-sonnenhang',
  name: 'Tierheim Sonnenhang',
  typ: 'tierheim',
  plz: '10115',
  ort: 'Berlin',
  lat: 52.52,
  lon: 13.41,
  website: null,
  kontakt_email: null,
  kontakt_telefon: null,
  logoUrl: null,
  badge: 'partner'
}

const pfotenglueck = {
  id: 2,
  slug: 'hundeschule-pfotengluck',
  name: 'Hundeschule Pfotenglück',
  typ: 'hundeschule',
  plz: '20095',
  ort: 'Hamburg',
  lat: 53.55,
  lon: 10.0,
  website: null,
  kontakt_email: null,
  kontakt_telefon: null,
  logoUrl: null,
  badge: 'geprueft'
}

describe('PartnersPage – Liste ohne PLZ', () => {
  test('lädt beim Öffnen alle Partner ohne plz-Parameter und zeigt sie als Karten', async () => {
    publicPartners.mockResolvedValue([sonnenhang, pfotenglueck])
    await render()
    await act(async () => Promise.resolve())

    expect(publicPartners).toHaveBeenCalledWith({})
    expect(container.textContent).toContain('Tierheim Sonnenhang')
    expect(container.textContent).toContain('Hundeschule Pfotenglück')
    expect(container.querySelectorAll('.partner-card').length).toBe(2)
  })

  test('zeigt einen leeren Zustand, wenn keine Partner gefunden werden', async () => {
    publicPartners.mockResolvedValue([])
    await render()
    await act(async () => Promise.resolve())
    expect(container.textContent).toContain('Keine Partner gefunden')
  })
})

describe('PartnersPage – Liste mit PLZ', () => {
  test('das Absenden mit einer 5-stelligen PLZ ruft api.publicPartners mit plz und radius auf', async () => {
    publicPartners.mockResolvedValue([sonnenhang, pfotenglueck])
    await render()
    await act(async () => Promise.resolve())
    publicPartners.mockClear()
    publicPartners.mockResolvedValue([sonnenhang])

    await act(async () => setInputValue(container.querySelector('#location-plz'), '10115'))
    await act(async () => container.querySelector('.location-picker').requestSubmit())

    expect(publicPartners).toHaveBeenCalledWith({ plz: '10115', radius: 25 })
    expect(container.textContent).toContain('Tierheim Sonnenhang')
    expect(container.textContent).not.toContain('Hundeschule Pfotenglück')
  })

  test('zeigt eine Fehlermeldung bei unbekannter PLZ (400 vom Server)', async () => {
    publicPartners.mockResolvedValue([])
    await render()
    await act(async () => Promise.resolve())
    publicPartners.mockRejectedValue(Object.assign(new Error('Diese Postleitzahl kennen wir nicht'), { status: 400 }))

    await act(async () => setInputValue(container.querySelector('#location-plz'), '99999'))
    await act(async () => container.querySelector('.location-picker').requestSubmit())

    expect(container.querySelector('[role="alert"]').textContent).toBe('Diese Postleitzahl kennen wir nicht')
  })

  test('eine unvollständige PLZ (1-4 Ziffern) zeigt einen Hinweis statt stillschweigend alle Partner zu listen', async () => {
    publicPartners.mockResolvedValue([sonnenhang, pfotenglueck])
    await render()
    await act(async () => Promise.resolve())
    publicPartners.mockClear()

    await act(async () => setInputValue(container.querySelector('#location-plz'), '101'))
    await act(async () => container.querySelector('.location-picker').requestSubmit())

    expect(container.querySelector('[role="alert"]').textContent).toBe('Bitte eine 5-stellige Postleitzahl eingeben.')
    // keine erneute (stillschweigende) Suche über alle Partner ausgelöst
    expect(publicPartners).not.toHaveBeenCalled()
  })
})

describe('PartnersPage – kein Standort-Knopf für Gäste', () => {
  test('LocationPicker bekommt kein allowGeolocation – der Knopf bleibt aus (Task 6 schaltet ihn frei)', async () => {
    publicPartners.mockResolvedValue([])
    await render()
    await act(async () => Promise.resolve())
    expect([...container.querySelectorAll('button')].some((btn) => btn.textContent.includes('Standort verwenden'))).toBe(false)
  })
})

describe('PartnersPage – Fuß', () => {
  test('nennt die Quelle der PLZ-Daten und verlinkt Impressum/Datenschutz', async () => {
    publicPartners.mockResolvedValue([])
    await render()
    await act(async () => Promise.resolve())
    expect(container.textContent).toContain('GeoNames')
    expect([...container.querySelectorAll('a')].find((a) => a.textContent === 'Impressum').getAttribute('href')).toBe('/impressum')
    expect([...container.querySelectorAll('a')].find((a) => a.textContent === 'Datenschutz').getAttribute('href')).toBe('/datenschutz')
  })
})
