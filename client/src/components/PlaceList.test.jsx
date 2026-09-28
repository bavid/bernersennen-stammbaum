// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test } from 'vitest'
import PlaceList from './PlaceList.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
})

async function render(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <PlaceList
          results={[]}
          radius={25}
          ort={null}
          limited={false}
          attribution={['© OpenStreetMap-Mitwirkende (ODbL)']}
          {...props}
        />
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
  lat: 52.5,
  lon: 13.4,
  distanceKm: 1.2,
  website: 'https://pfotengluck.example',
  telefon: '030 1234567',
  email: 'info@pfotengluck.example',
  adresse: 'Musterstraße 1, 10115 Berlin',
  quelle: 'osm',
  badge: null
}

const deichland = {
  id: 'fixture:3',
  name: 'Tierschutzverein Deichland',
  typ: 'vermittlung',
  lat: 53.4,
  lon: 8.6,
  distanceKm: 3.5,
  website: null,
  telefon: null,
  email: null,
  adresse: null,
  quelle: 'fixture',
  badge: null
}

describe('PlaceList – Treffer-Kopf', () => {
  test('zeigt die Trefferzahl, den Umkreis und den Ort', async () => {
    await render({ results: [sonnenhang, pfotenglueck], radius: 25, ort: 'Berlin' })
    expect(container.textContent).toContain('2 Treffer im Umkreis von 25 km um Berlin')
  })

  test('fällt ohne Ort auf "euren Standort" zurück', async () => {
    await render({ results: [sonnenhang], radius: 10, ort: null })
    expect(container.textContent).toContain('1 Treffer im Umkreis von 10 km um euren Standort')
  })
})

describe('PlaceList – Einträge', () => {
  test('Partner zeigen die Badge "Partner" und einen Link zum Portal', async () => {
    await render({ results: [sonnenhang] })
    expect(container.textContent).toContain('Tierheim Sonnenhang')
    expect(container.textContent).toContain('Partner')
    const portalLink = [...container.querySelectorAll('a')].find((a) => a.textContent === 'Zum Portal')
    expect(portalLink.getAttribute('href')).toBe('/p/tierheim-sonnenhang')
  })

  test('andere Treffer zeigen Website, Telefon, Adresse sowie Maps-/OSM-Links', async () => {
    await render({ results: [pfotenglueck] })
    expect(container.textContent).toContain('Musterstraße 1, 10115 Berlin')
    const website = [...container.querySelectorAll('a')].find((a) => a.href === 'https://pfotengluck.example/')
    expect(website).not.toBeUndefined()
    const tel = [...container.querySelectorAll('a')].find((a) => a.getAttribute('href') === 'tel:030 1234567')
    expect(tel).not.toBeUndefined()
    const maps = [...container.querySelectorAll('a')].find((a) => a.textContent === 'In Google Maps öffnen')
    expect(maps.getAttribute('href')).toBe('https://www.google.com/maps/search/?api=1&query=52.5,13.4')
    const osm = [...container.querySelectorAll('a')].find((a) => a.textContent === 'OpenStreetMap')
    expect(osm.getAttribute('href')).toBe('https://www.openstreetmap.org/?mlat=52.5&mlon=13.4#map=16/52.5/13.4')
  })
})

describe('PlaceList – Filter-Chips', () => {
  test('"Tierheime" zeigt tierheim und vermittlung, blendet Hundeschulen aus', async () => {
    await render({ results: [sonnenhang, pfotenglueck, deichland] })
    const tierheimeChip = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Tierheime')
    await act(async () => tierheimeChip.click())

    expect(container.textContent).toContain('Tierheim Sonnenhang')
    expect(container.textContent).toContain('Tierschutzverein Deichland')
    expect(container.textContent).not.toContain('Hundeschule Pfotenglück')
  })

  test('"Hundeschulen" zeigt nur den Typ hundeschule', async () => {
    await render({ results: [sonnenhang, pfotenglueck, deichland] })
    const chip = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Hundeschulen')
    await act(async () => chip.click())

    expect(container.textContent).toContain('Hundeschule Pfotenglück')
    expect(container.textContent).not.toContain('Tierheim Sonnenhang')
    expect(container.textContent).not.toContain('Tierschutzverein Deichland')
  })

  test('"Alle" zeigt wieder alle Treffer', async () => {
    await render({ results: [sonnenhang, pfotenglueck] })
    const hundeschulenChip = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Hundeschulen')
    await act(async () => hundeschulenChip.click())
    const alleChip = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Alle')
    await act(async () => alleChip.click())

    expect(container.textContent).toContain('Tierheim Sonnenhang')
    expect(container.textContent).toContain('Hundeschule Pfotenglück')
  })

  test('zeigt einen leeren Zustand, wenn der Filter keine Treffer lässt', async () => {
    await render({ results: [sonnenhang] })
    const chip = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Hundeschulen')
    await act(async () => chip.click())
    expect(container.textContent).toContain('Keine Treffer')
  })
})

describe('PlaceList – limited-Hinweis und Quellenangabe', () => {
  test('zeigt den Hinweis, wenn limited gesetzt ist', async () => {
    await render({ results: [sonnenhang], limited: true })
    expect(container.textContent).toContain('Gerade sind nur gespeicherte Ergebnisse verfügbar – später mehr.')
  })

  test('zeigt den Hinweis nicht, wenn limited fehlt', async () => {
    await render({ results: [sonnenhang], limited: false })
    expect(container.textContent).not.toContain('Gerade sind nur gespeicherte Ergebnisse verfügbar')
  })

  test('nennt die OSM-Quellenangabe unter der Liste', async () => {
    await render({ results: [sonnenhang], attribution: ['© OpenStreetMap-Mitwirkende (ODbL)'] })
    expect(container.textContent).toContain('© OpenStreetMap-Mitwirkende (ODbL)')
  })
})
