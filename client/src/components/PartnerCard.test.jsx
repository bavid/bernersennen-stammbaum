// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test } from 'vitest'
import PartnerCard from './PartnerCard.jsx'
import { PreviewProvider } from '../lib/preview.js'

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

async function render(partner, { preview = false } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <PreviewProvider value={preview}>
          <PartnerCard partner={partner} />
        </PreviewProvider>
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
  test('zeigt Name, Typ-Label, das Partner-Merkmal und die Entfernung mit deutschem Komma', async () => {
    await render({ ...basePartner, distanceKm: 3.4 })
    expect(container.querySelector('h3').textContent).toBe('Tierheim Sonnenhang')
    const meta = container.querySelector('.partner-card-meta')
    expect(meta.querySelector('.partner-mark').textContent).toBe('Partner')
    expect(meta.textContent).toContain('Tierheim')
    expect(meta.textContent).toContain('10115 Berlin')
    expect(meta.textContent).toContain('3,4 km')
  })

  test('Phase U: höchstens EIN Merkmal - "geprüft" (ist_partner=0) zeigt gar keins, keine Pillen mehr', async () => {
    await render({ ...basePartner, badge: 'geprueft' })
    expect(container.textContent).not.toContain('geprüft')
    expect(container.querySelector('.partner-mark')).toBeNull()
    expect(container.querySelector('.pill')).toBeNull()
  })

  test('ein offizieller Partner trägt genau ein Merkmal', async () => {
    await render(basePartner)
    expect(container.querySelectorAll('.partner-mark, .pill')).toHaveLength(1)
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
    const google = linkByText('Tierheim Sonnenhang in Google Maps')
    const osm = linkByText('Tierheim Sonnenhang in OpenStreetMap')
    expect(google.getAttribute('href')).toBe('https://www.google.com/maps/search/?api=1&query=52.523406,13.411899')
    expect(osm.getAttribute('href')).toBe('https://www.openstreetmap.org/?mlat=52.523406&mlon=13.411899#map=16/52.523406/13.411899')
    expect(google.getAttribute('rel')).toBe('noopener noreferrer')
  })

  test('keine Maps-Links ohne Koordinaten', async () => {
    await render({ ...basePartner, lat: null, lon: null })
    expect(linkByText('Tierheim Sonnenhang in Google Maps')).toBeUndefined()
    expect(linkByText('Tierheim Sonnenhang in OpenStreetMap')).toBeUndefined()
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

// Phase P1: teaserFoto - das neueste Einblick-Foto als kleines Vorschaubild.
describe('PartnerCard – Teaser-Foto', () => {
  test('zeigt ein öffentliches teaserFoto klein, lazy und mit Alternativtext', async () => {
    await render({ ...basePartner, teaserFoto: '/public-media/11111111-2222-3333-4444-555555555555.jpg' })

    const teaser = container.querySelector('.partner-card-teaser')
    expect(teaser.getAttribute('src')).toBe('/public-media/11111111-2222-3333-4444-555555555555.jpg')
    expect(teaser.getAttribute('alt')).toBe('Einblick bei Tierheim Sonnenhang')
    expect(teaser.getAttribute('loading')).toBe('lazy')
    expect(teaser.getAttribute('width')).toBe('72')
    expect(teaser.getAttribute('height')).toBe('72')
  })

  test('mit Logo steht das Logo links, das teaserFoto entfällt (kein zweites Bild neben dem Namen)', async () => {
    await render({ ...basePartner, logoUrl: '/partner-media/logo.png', teaserFoto: '/public-media/11111111-2222-3333-4444-555555555555.jpg' })
    expect(container.querySelector('.partner-card-logo').getAttribute('src')).toBe('/partner-media/logo.png')
    expect(container.querySelector('.partner-card-teaser')).toBeNull()
  })

  test('ohne teaserFoto kein Bild', async () => {
    await render({ ...basePartner, teaserFoto: null })
    expect(container.querySelector('.partner-card-teaser')).toBeNull()
  })

  test.each([
    ['fremde Adresse', 'https://example.org/foto.jpg'],
    ['javascript:', 'javascript:alert(1)'],
    ['/uploads außerhalb der Vorschau', '/uploads/11111111-2222-3333-4444-555555555555.jpg'],
    ['Pfad mit weiteren Teilen', '/public-media/../uploads/geheim.jpg']
  ])('ignoriert ein teaserFoto, das kein öffentliches Foto ist (%s)', async (_label, url) => {
    await render({ ...basePartner, teaserFoto: url })
    expect(container.querySelector('.partner-card-teaser')).toBeNull()
  })

  test('in der Kundensicht zählt auch das eigene Foto über /uploads', async () => {
    await render({ ...basePartner, teaserFoto: '/uploads/11111111-2222-3333-4444-555555555555.jpg' }, { preview: true })
    expect(container.querySelector('.partner-card-teaser').getAttribute('src')).toBe('/uploads/11111111-2222-3333-4444-555555555555.jpg')
  })
})

describe('PartnerCard – Kundensicht', () => {
  test('die eigene Karte (vorschau: true) bekommt "Das seid ihr"; alle Links sind deaktiviert', async () => {
    await render({ ...basePartner, vorschau: true, clickUrl: '/r/partner-website/1' }, { preview: true })

    const card = container.querySelector('.partner-card')
    expect(card.classList.contains('is-own-preview')).toBe(true)
    expect(container.querySelector('.preview-own-badge').textContent).toBe('Das seid ihr')
    expect(container.querySelectorAll('a')).toHaveLength(0)
    const disabled = [...container.querySelectorAll('[aria-disabled="true"]')]
    expect(disabled.map((el) => el.textContent.trim())).toEqual([
      'Zum Portal',
      'Website',
      'Tierheim Sonnenhang in Google Maps',
      'Tierheim Sonnenhang in OpenStreetMap'
    ])
    for (const el of disabled) {
      expect(el.getAttribute('role')).toBe('link')
      expect(el.getAttribute('title')).toBe('In der Vorschau deaktiviert')
      expect(el.getAttribute('aria-description')).toBe('In der Vorschau deaktiviert')
    }
  })

  test('ohne Vorschau bleibt vorschau: true wirkungslos', async () => {
    await render({ ...basePartner, vorschau: true })
    expect(container.querySelector('.preview-own-badge')).toBeNull()
    expect(linkByText('Zum Portal').getAttribute('href')).toBe('/p/tierheim-sonnenhang')
  })
})
