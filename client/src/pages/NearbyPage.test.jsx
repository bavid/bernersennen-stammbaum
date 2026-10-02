// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { searchPlaces } = vi.hoisted(() => ({ searchPlaces: vi.fn() }))
vi.mock('../api', () => ({ api: { searchPlaces } }))

import NearbyPage from './NearbyPage.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
let originalIsSecureContext
let originalGeolocation

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

function setInputValue(input, value) {
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function setSecureContext(value) {
  Object.defineProperty(window, 'isSecureContext', { value, configurable: true })
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
  searchPlaces.mockReset()
  if (originalIsSecureContext !== undefined) Object.defineProperty(window, 'isSecureContext', originalIsSecureContext)
  if (originalGeolocation !== undefined) Object.defineProperty(navigator, 'geolocation', originalGeolocation)
  else delete navigator.geolocation
  window.localStorage.clear()
})

async function render() {
  originalIsSecureContext = Object.getOwnPropertyDescriptor(window, 'isSecureContext')
  originalGeolocation = Object.getOwnPropertyDescriptor(navigator, 'geolocation')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <NearbyPage />
      </MemoryRouter>
    )
  )
  return container
}

const sonnenhang = {
  id: 'partner:1',
  name: 'Tierheim Sonnenhang',
  typ: 'tierheim',
  lat: 52.52,
  lon: 13.41,
  distanceKm: 0.4,
  website: null,
  telefon: null,
  email: null,
  adresse: null,
  quelle: 'partner',
  badge: 'partner',
  slug: 'tierheim-sonnenhang',
  logoUrl: null
}

const pfotenglueck = {
  id: 'osm:node/123',
  name: 'Hundeschule Pfotenglück',
  typ: 'hundeschule',
  lat: 53.55,
  lon: 10.0,
  distanceKm: 3.1,
  website: 'https://pfotengluck.example',
  telefon: null,
  email: null,
  adresse: 'Musterweg 2, 20095 Hamburg',
  quelle: 'osm',
  badge: null
}

const baseResponse = {
  center: { lat: 52.52, lon: 13.41, ort: 'Berlin' },
  radius: 25,
  results: [sonnenhang, pfotenglueck],
  limited: false,
  attribution: ['© OpenStreetMap-Mitwirkende (ODbL)']
}

describe('NearbyPage – Kopf', () => {
  test('zeigt Eyebrow und Überschrift', async () => {
    await render()
    expect(container.querySelector('.eyebrow')?.textContent).toBe('In der Nähe')
    expect(container.querySelector('h1')?.textContent).toBe('Tierheime & Hundeschulen')
  })

  // "euch"/"eurem" in Kopftext und Hinweisen (ihr-Form) - der leere Zustand sagte bislang "Gib" (du-Form)
  test('Leerzustand spricht konsistent in der ihr-Form ("Gebt", nicht "Gib")', async () => {
    await render()
    expect(container.textContent).toContain('Gebt eine Postleitzahl ein oder nutzt euren Standort, um loszulegen.')
    expect(container.textContent).not.toMatch(/\bGib eine Postleitzahl\b/)
  })
})

// Phase V1: dezente Ortswahl - ohne Ort offen, nach der Suche nur noch eine Zeile mit "ändern".
describe('NearbyPage – dezente Ortswahl', () => {
  test('ohne gemerkte PLZ offen; nach der Suche zugeklappt auf "In der Nähe von 10115 Berlin · ändern"', async () => {
    searchPlaces.mockResolvedValue(baseResponse)
    await render()
    expect(container.querySelector('.location-summary')).toBeNull()
    await act(async () => setInputValue(container.querySelector('#location-plz'), '10115'))
    await act(async () => container.querySelector('.location-picker').requestSubmit())
    expect(container.querySelector('#location-plz')).toBeNull()
    expect(container.querySelector('.location-summary').textContent).toContain('In der Nähe von 10115 Berlin')
    expect(container.querySelector('.location-summary-toggle').textContent).toContain('ändern')
  })

  test('mit gemerkter PLZ sucht die Seite gleich und zeigt nur die Zeile', async () => {
    window.localStorage.setItem('chronik.nearbyPlz', JSON.stringify('10115'))
    searchPlaces.mockResolvedValue(baseResponse)
    await render()
    expect(searchPlaces).toHaveBeenCalledWith({ plz: '10115' }, 25)
    expect(container.querySelector('#location-plz')).toBeNull()
    expect(container.querySelector('.location-summary').textContent).toContain('In der Nähe von 10115')
  })
})

describe('NearbyPage – Suche mit PLZ', () => {
  test('ruft api.searchPlaces mit { plz } und dem gewählten Radius auf und zeigt die Treffer', async () => {
    searchPlaces.mockResolvedValue(baseResponse)
    await render()

    await act(async () => setInputValue(container.querySelector('#location-plz'), '10115'))
    await act(async () => container.querySelector('.location-picker').requestSubmit())

    expect(searchPlaces).toHaveBeenCalledWith({ plz: '10115' }, 25)
    expect(container.textContent).toContain('Tierheim Sonnenhang')
    expect(container.textContent).toContain('Hundeschule Pfotenglück')
    expect(container.textContent).toContain('2 Treffer im Umkreis von 25 km um Berlin')
  })

  test('merkt sich PLZ und Radius fürs nächste Mal (nicht die Koordinaten)', async () => {
    searchPlaces.mockResolvedValue(baseResponse)
    await render()

    await act(async () => setInputValue(container.querySelector('#location-plz'), '10115'))
    const radiusSelect = container.querySelector('#location-radius')
    const nativeSelectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
    await act(async () => {
      nativeSelectSetter.call(radiusSelect, '50')
      radiusSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => container.querySelector('.location-picker').requestSubmit())

    expect(window.localStorage.getItem('chronik.nearbyPlz')).toBe('"10115"')
    expect(window.localStorage.getItem('chronik.nearbyRadius')).toBe('50')
  })

  test('Fehler bei unbekannter PLZ (400 vom Server) erscheint als role="alert"', async () => {
    searchPlaces.mockRejectedValue(Object.assign(new Error('Diese Postleitzahl kennen wir nicht'), { status: 400 }))
    await render()

    await act(async () => setInputValue(container.querySelector('#location-plz'), '99999'))
    await act(async () => container.querySelector('.location-picker').requestSubmit())

    expect(container.querySelector('[role="alert"]').textContent).toBe('Diese Postleitzahl kennen wir nicht')
  })
})

describe('NearbyPage – Suche über Standort', () => {
  test('rundet die Geolocation-Koordinaten auf 0,01 und ruft api.searchPlaces mit { lat, lon } auf', async () => {
    setSecureContext(true)
    const getCurrentPosition = vi.fn((success) => success({ coords: { latitude: 52.523406, longitude: 13.411899 } }))
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
    searchPlaces.mockResolvedValue({ ...baseResponse, center: { lat: 52.52, lon: 13.41 } })
    await render()

    const button = [...container.querySelectorAll('button')].find((btn) => btn.textContent.includes('Standort verwenden'))
    expect(button).not.toBeUndefined()
    await act(async () => button.click())

    expect(searchPlaces).toHaveBeenCalledWith({ lat: 52.52, lon: 13.41 }, 25)
  })

  test('zeigt den Datenschutz-Hinweis direkt unter dem Standort-Knopf', async () => {
    setSecureContext(true)
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: vi.fn() }, configurable: true })
    await render()

    expect(container.textContent).toContain(
      'Dein Standort wird auf etwa 1 km gerundet, nur für diese Suche verwendet und nicht gespeichert.'
    )
  })

  test('zeigt statt des Knopfs den Hinweis auf die PLZ in einem unsicheren Kontext', async () => {
    setSecureContext(false)
    await render()

    expect([...container.querySelectorAll('button')].some((btn) => btn.textContent.includes('Standort verwenden'))).toBe(false)
    expect(container.textContent).toContain('Standort geht nur über eine sichere Verbindung – nutzt die PLZ.')
  })
})

describe('NearbyPage – limited-Hinweis und Quellenangabe', () => {
  test('zeigt den limited-Hinweis, wenn der Server ihn meldet', async () => {
    searchPlaces.mockResolvedValue({ ...baseResponse, limited: true })
    await render()
    await act(async () => setInputValue(container.querySelector('#location-plz'), '10115'))
    await act(async () => container.querySelector('.location-picker').requestSubmit())

    expect(container.textContent).toContain('Gerade sind nur gespeicherte Ergebnisse verfügbar – später mehr.')
  })

  test('nennt die OSM-Quellenangabe unter der Liste, verlinkt zur OSM-Copyright-Seite, und nennt GeoNames', async () => {
    searchPlaces.mockResolvedValue(baseResponse)
    await render()
    await act(async () => setInputValue(container.querySelector('#location-plz'), '10115'))
    await act(async () => container.querySelector('.location-picker').requestSubmit())

    expect(container.textContent).toContain('© OpenStreetMap-Mitwirkende (ODbL)')
    const link = [...container.querySelectorAll('a')].find((a) => a.textContent === '© OpenStreetMap-Mitwirkende (ODbL)')
    expect(link.getAttribute('href')).toBe('https://www.openstreetmap.org/copyright')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(container.textContent).toContain('Postleitzahlen: GeoNames (CC BY 4.0)')
  })
})

describe('NearbyPage – Filter', () => {
  test('Filter-Chips blenden Treffer nach Art aus', async () => {
    searchPlaces.mockResolvedValue(baseResponse)
    await render()
    await act(async () => setInputValue(container.querySelector('#location-plz'), '10115'))
    await act(async () => container.querySelector('.location-picker').requestSubmit())

    const chip = [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'Hundeschulen')
    await act(async () => chip.click())

    expect(container.textContent).toContain('Hundeschule Pfotenglück')
    expect(container.textContent).not.toContain('Tierheim Sonnenhang')
  })
})
