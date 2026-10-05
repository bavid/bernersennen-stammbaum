// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import PartnerDiscoverCard from './PartnerDiscoverCard.jsx'
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
          <PartnerDiscoverCard partner={partner} />
        </PreviewProvider>
      </MemoryRouter>
    )
  )
  return container
}

function anzeige(overrides) {
  return {
    id: 11,
    kind: 'promotion',
    bereich: 'hundeschule',
    kennzeichnung: 'Anzeige',
    empfohlenVon: null,
    titel: 'Welpenkurs ab Oktober',
    text: 'Sechs Samstage für Welpen bis 16 Wochen: Leinenführigkeit, Rückruf und viel Spiel.',
    bildUrl: null,
    url: 'https://example.org/welpenkurs',
    clickUrl: '/r/promotion/11',
    ...overrides
  }
}

const school = {
  id: 1,
  kind: 'partner',
  slug: 'hundeschule-pfotenglueck',
  name: 'Hundeschule Pfotenglück',
  typ: 'hundeschule',
  plz: '20095',
  ort: 'Hamburg',
  logoUrl: '/partner-media/logo.png',
  badge: 'partner',
  kurztext: 'Welpenkurse und Hundetraining für Familien aus der Region.',
  url: 'https://example.org/pfotenglueck',
  clickUrl: '/r/partner-website/1',
  anzeigen: [anzeige(), anzeige({ id: 12, titel: 'Einzeltraining am Abend', text: null, clickUrl: '/r/promotion/12' })],
  einblicke: [
    { id: 3, fotoUrl: '/public-media/a.jpg', datum: '2026-09-26', text: 'Welpengruppe am Samstag' },
    { id: 2, fotoUrl: '/public-media/b.jpg', datum: '2026-09-12', text: null },
    { id: 1, fotoUrl: '/uploads/privat.jpg', datum: '2026-08-22', text: 'Nur in der Vorschau' }
  ]
}

const link = (el, text) => [...el.querySelectorAll('a')].find((a) => a.textContent.includes(text))

describe('PartnerDiscoverCard – Kopf', () => {
  test('Logo, Name, Partner-Merkmal, Typ und Ort, Kurzbeschreibung, "Zum Portal" und "Website" über die Klickzählung', async () => {
    await render(school)
    const card = container.querySelector('article.partner-discover-card')
    expect(card.querySelector('h3').textContent).toBe('Hundeschule Pfotenglück')
    expect(card.querySelector('img.partner-card-logo').getAttribute('src')).toBe('/partner-media/logo.png')
    expect(card.querySelector('.partner-mark').textContent).toBe('Partner')
    expect(card.querySelector('.partner-card-meta').textContent).toContain('20095 Hamburg')
    expect(card.querySelector('.partner-discover-text').textContent).toBe('Welpenkurse und Hundetraining für Familien aus der Region.')
    expect(link(card, 'Zum Portal').getAttribute('href')).toBe('/p/hundeschule-pfotenglueck')
    expect(link(card, 'Website').getAttribute('href')).toBe('/r/partner-website/1')
  })

  test('ohne Logo ein ruhiges Symbol, ohne Kurztext und Website nichts Leeres', async () => {
    await render({ ...school, logoUrl: null, kurztext: null, clickUrl: null, url: null, anzeigen: [], einblicke: [] })
    expect(container.querySelector('.partner-card-logo-fallback')).not.toBeNull()
    expect(container.querySelector('.partner-discover-text')).toBeNull()
    expect(link(container, 'Website')).toBeUndefined()
    expect(container.querySelector('.partner-discover-ads')).toBeNull()
    expect(container.querySelector('.partner-discover-einblicke')).toBeNull()
  })
})

describe('PartnerDiscoverCard – Anzeigen', () => {
  test('kompakte Zeilen in der Reihenfolge des Servers: Kennzeichnung, Titel als Link über /r, eine Zeile Text', async () => {
    await render(school)
    const rows = [...container.querySelectorAll('.partner-discover-ads > li')]
    expect(rows.map((row) => row.querySelector('.partner-discover-ad-title').textContent)).toEqual(['Welpenkurs ab Oktober', 'Einzeltraining am Abend'])
    expect(rows[0].querySelector('.promotion-badge').textContent).toBe('Anzeige')
    expect(rows[1].querySelector('.promotion-badge').textContent).toBe('Anzeige')
    const first = rows[0].querySelector('a')
    expect(first.getAttribute('href')).toBe('/r/promotion/11')
    expect(first.getAttribute('rel')).toBe('sponsored noopener noreferrer')
    expect(first.getAttribute('target')).toBe('_blank')
    expect(rows[0].querySelector('.partner-discover-ad-text').textContent).toContain('Sechs Samstage')
    expect(rows[1].querySelector('.partner-discover-ad-text')).toBeNull()
    expect(container.querySelector('.partner-discover-ads').getAttribute('aria-label')).toBe('Anzeigen von Hundeschule Pfotenglück')
  })

  test('eine verknüpfte Empfehlung behält ihre Kennzeichnung (Partner) und bekommt kein sponsored', async () => {
    await render({ ...school, anzeigen: [anzeige({ kennzeichnung: 'Partner', titel: 'Sommerkurs' })] })
    const row = container.querySelector('.partner-discover-ads > li')
    expect(row.querySelector('.promotion-badge').textContent).toBe('Partner')
    expect(row.querySelector('a').getAttribute('rel')).toBe('noopener noreferrer')
  })

  test('ohne gültigen clickUrl steht der Titel ohne Link da', async () => {
    await render({ ...school, anzeigen: [anzeige({ clickUrl: 'https://example.org/direkt' })] })
    const row = container.querySelector('.partner-discover-ads > li')
    expect(row.querySelector('a')).toBeNull()
    expect(row.querySelector('.partner-discover-ad-title').textContent).toBe('Welpenkurs ab Oktober')
  })

  test('höchstens drei Anzeigen, auch wenn mehr geliefert werden', async () => {
    const many = [1, 2, 3, 4].map((n) => anzeige({ id: n, titel: `Kurs ${n}`, clickUrl: `/r/promotion/${n}` }))
    await render({ ...school, anzeigen: many })
    expect(container.querySelectorAll('.partner-discover-ads > li')).toHaveLength(3)
  })
})

describe('PartnerDiscoverCard – Einblicke', () => {
  test('kleine Fotos mit Datum, nur öffentliche Adressen', async () => {
    await render(school)
    const items = [...container.querySelectorAll('.partner-discover-einblicke > li')]
    expect(items).toHaveLength(2)
    expect(items[0].querySelector('img').getAttribute('src')).toBe('/public-media/a.jpg')
    expect(items[0].querySelector('img').getAttribute('alt')).toBe('Welpengruppe am Samstag')
    expect(items[0].querySelector('time').getAttribute('dateTime')).toBe('2026-09-26')
    expect(items[0].querySelector('time').textContent).toBe('26.09.2026')
    expect(items[1].querySelector('img').getAttribute('alt')).toBe('Einblick vom 12. September 2026')
  })

  test('in der Kundensicht auch /uploads, dazu "Das seid ihr" und "Wartet auf Freigabe" ohne Link', async () => {
    const pending = anzeige({ id: 13, titel: 'Noch in Prüfung', vorschau: true, freigabe: 'eingereicht', clickUrl: null })
    await render({ ...school, vorschau: true, anzeigen: [pending] }, { preview: true })
    const card = container.querySelector('article.partner-discover-card')
    expect(card.classList.contains('is-own-preview')).toBe(true)
    expect(card.querySelector('.preview-own-badge').textContent).toBe('Das seid ihr')
    expect(container.querySelectorAll('.partner-discover-einblicke > li')).toHaveLength(3)
    const row = container.querySelector('.partner-discover-ads > li')
    expect(row.textContent).toContain('Wartet auf Freigabe')
    expect(row.querySelector('a')).toBeNull()
  })
})

// Phase V4a: "Nächster Termin" aus dem Kalender und die kommenden Termine einer Anzeige.
describe('PartnerDiscoverCard – Termine', () => {
  afterEach(() => vi.useRealTimers())

  test('"Nächster Termin" im Kopf - ohne Termin keine Zeile', async () => {
    await render({ ...school, naechsterTermin: { datum: '2026-10-10', uhrzeit: '10:00', ende: '11:00', titel: 'Welpenspielstunde', ort: null } })
    const line = container.querySelector('.partner-discover-next')
    expect(line.textContent).toBe('Nächster Termin: Sa, 10.10., 10:00 · Welpenspielstunde')
    await render({ ...school, naechsterTermin: null })
    expect(container.querySelector('.partner-discover-next')).toBeNull()
  })

  test('eine Anzeige zeigt ihre kommenden Termine', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-03T10:00:00'))
    const zeitraeume = [{ von: '2026-09-01', bis: null }, { von: '2026-11-01', bis: null }, { von: '2026-12-05', bis: '2026-12-10' }]
    await render({ ...school, anzeigen: [anzeige({ zeitraeume })] })
    expect(container.querySelector('.partner-discover-ad-termine').textContent).toBe('Termine: 1.11., 5.–10.12.')
  })
})

// Phase F: der leise Hinweis „überall sichtbar“ - der Server markiert Partner, die wegen „Überall sichtbar“ statt wegen der
// Nähe in der Liste stehen (ueberall: true, server/lib/ueberallSichtbar.js).
describe('PartnerDiscoverCard – „überall sichtbar“', () => {
  test('mit ueberall: Hinweis in der Meta-Zeile, sonst eine Partner-Karte wie jede andere (Merkmal, Entfernung, Portal)', async () => {
    await render({ ...school, distanceKm: 255.3, ueberall: true })
    const meta = container.querySelector('.partner-card-meta')
    expect(meta.querySelector('.partner-card-ueberall').textContent).toBe('überall sichtbar')
    expect(meta.querySelector('.partner-mark')).not.toBeNull()
    expect(meta.querySelector('.partner-card-distance')).not.toBeNull()
    expect(link(container, 'Zum Portal').getAttribute('href')).toBe('/p/hundeschule-pfotenglueck')
  })

  test('ohne ueberall: kein Hinweis', async () => {
    await render({ ...school, distanceKm: 3.2 })
    expect(container.querySelector('.partner-card-ueberall')).toBeNull()
  })
})
