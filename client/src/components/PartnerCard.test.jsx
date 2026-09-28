// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test } from 'vitest'
import PartnerCard from './PartnerCard.jsx'

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

async function render(partner) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <PartnerCard partner={partner} />
      </MemoryRouter>
    )
  )
  return container
}

const basePartner = {
  id: 1,
  slug: 'tierheim-sonnenhang',
  name: 'Tierheim Sonnenhang',
  typ: 'tierheim',
  plz: '10115',
  ort: 'Berlin',
  lat: 52.523406,
  lon: 13.411899,
  website: 'https://example.org',
  kontakt_email: null,
  kontakt_telefon: null,
  logoUrl: null,
  badge: 'partner'
}

function linkByText(text) {
  return [...container.querySelectorAll('a')].find((a) => a.textContent.trim() === text)
}

describe('PartnerCard', () => {
  test('zeigt Name, Typ-Label, Badge und Entfernung mit deutschem Komma', async () => {
    await render({ ...basePartner, distanceKm: 3.4 })
    expect(container.textContent).toContain('Tierheim Sonnenhang')
    expect(container.textContent).toContain('Tierheim')
    expect(container.textContent).toContain('Partner')
    expect(container.textContent).toContain('3,4 km')
  })

  test('zeigt "geprüft" statt "Partner", wenn ist_partner=0', async () => {
    await render({ ...basePartner, badge: 'geprueft' })
    expect(container.textContent).toContain('geprüft')
  })

  test('verlinkt "Zum Portal" auf /p/:slug', async () => {
    await render(basePartner)
    expect(linkByText('Zum Portal').getAttribute('href')).toBe('/p/tierheim-sonnenhang')
  })

  test('Website-Link nur bei http(s), mit target=_blank und rel=noopener noreferrer', async () => {
    await render(basePartner)
    const link = [...container.querySelectorAll('a')].find((a) => a.textContent.includes('Website'))
    expect(link.getAttribute('href')).toBe('https://example.org')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  test('keine Website verlinkt, wenn die URL nicht mit http(s):// beginnt', async () => {
    await render({ ...basePartner, website: 'javascript:alert(1)' })
    expect([...container.querySelectorAll('a')].some((a) => a.textContent.includes('Website'))).toBe(false)
  })

  test('Maps-Links sind korrekt kodiert (Google und OpenStreetMap)', async () => {
    await render(basePartner)
    const google = linkByText('In Google Maps öffnen')
    const osm = linkByText('OpenStreetMap')
    expect(google.getAttribute('href')).toBe('https://www.google.com/maps/search/?api=1&query=52.523406,13.411899')
    expect(osm.getAttribute('href')).toBe('https://www.openstreetmap.org/?mlat=52.523406&mlon=13.411899#map=16/52.523406/13.411899')
    expect(google.getAttribute('rel')).toBe('noopener noreferrer')
  })

  test('keine Maps-Links ohne Koordinaten', async () => {
    await render({ ...basePartner, lat: null, lon: null })
    expect(linkByText('In Google Maps öffnen')).toBeUndefined()
    expect(linkByText('OpenStreetMap')).toBeUndefined()
  })

  test('Entdecken: mit clickUrl führt der Website-Link über die Klickzählung /r/...', async () => {
    const { website, ...withoutWebsite } = basePartner
    await render({ ...withoutWebsite, url: website, clickUrl: '/r/partner-website/1' })
    const link = [...container.querySelectorAll('a')].find((a) => a.textContent.includes('Website'))
    expect(link.getAttribute('href')).toBe('/r/partner-website/1')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  test('eine clickUrl, die nicht auf /r/ zeigt, wird nie verlinkt', async () => {
    const { website, ...withoutWebsite } = basePartner
    await render({ ...withoutWebsite, clickUrl: 'https://example.org/woanders' })
    expect([...container.querySelectorAll('a')].some((a) => a.textContent.includes('Website'))).toBe(false)
  })
})
