// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import PromotionCard from './PromotionCard.jsx'

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

async function render(promotion, props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<PromotionCard promotion={promotion} {...props} />))
  return container
}

const empfehlung = {
  id: 7,
  kind: 'promotion',
  bereich: 'futter',
  kennzeichnung: 'Empfehlung',
  empfohlenVon: 'Hundeschule Wiesengrund',
  titel: 'Haferflocken-Knabber',
  text: 'Kleine Knabberstücke aus Hafer und Karotte.',
  bildUrl: '/partner-media/knabber.webp',
  tierart: 'hund',
  url: 'https://example.org/knabber',
  clickUrl: '/r/promotion/7'
}

const anzeige = {
  ...empfehlung,
  id: 8,
  kennzeichnung: 'Anzeige',
  empfohlenVon: null,
  titel: 'Probierpaket Mühlental',
  url: 'https://example.org/probierpaket',
  clickUrl: '/r/promotion/8'
}

function link() {
  return container.querySelector('a')
}

describe('PromotionCard', () => {
  test('zeigt Titel, Text und Bild', async () => {
    await render(empfehlung)
    expect(container.querySelector('h3').textContent).toBe('Haferflocken-Knabber')
    expect(container.textContent).toContain('Kleine Knabberstücke aus Hafer und Karotte.')
    expect(container.querySelector('img').getAttribute('src')).toBe('/partner-media/knabber.webp')
  })

  test('das Bild steht außerhalb des Links und trägt den Titel als Alternativtext', async () => {
    await render(empfehlung)
    const img = container.querySelector('img')
    expect(img.getAttribute('alt')).toBe('Haferflocken-Knabber')
    expect(img.closest('a')).toBeNull()
  })

  test('ein Bild außerhalb von /partner-media wird nicht angezeigt', async () => {
    await render({ ...empfehlung, bildUrl: 'https://example.org/fremd.png' })
    expect(container.querySelector('img')).toBeNull()
  })

  test('Empfehlung: Kennzeichnung "Empfehlung von …" als lesbarer Text', async () => {
    await render(empfehlung)
    expect(container.querySelector('.promotion-badge').textContent).toBe('Empfehlung von Hundeschule Wiesengrund')
  })

  test('Anzeige: auffälliges Badge "Anzeige" als Text, nicht nur als Farbe', async () => {
    await render(anzeige)
    const badge = container.querySelector('.promotion-badge')
    expect(badge.textContent).toBe('Anzeige')
    expect(badge.classList.contains('promotion-badge-anzeige')).toBe(true)
  })

  test('Partner: Kennzeichnung "Partner"', async () => {
    await render({ ...empfehlung, kennzeichnung: 'Partner', empfohlenVon: null })
    expect(container.querySelector('.promotion-badge').textContent).toBe('Partner')
  })

  test('der Link führt über die Klickzählung /r/..., öffnet in neuem Tab', async () => {
    await render(empfehlung)
    expect(link().getAttribute('href')).toBe('/r/promotion/7')
    expect(link().getAttribute('target')).toBe('_blank')
  })

  test('Anzeigen-Links tragen rel="sponsored noopener noreferrer"', async () => {
    await render(anzeige)
    expect(link().getAttribute('rel')).toBe('sponsored noopener noreferrer')
  })

  test('Empfehlungs-Links tragen kein sponsored', async () => {
    await render(empfehlung)
    expect(link().getAttribute('rel')).toBe('noopener noreferrer')
    expect(link().getAttribute('rel')).not.toContain('sponsored')
  })

  test('der Linktext nennt das Ziel (für Screenreader eindeutig)', async () => {
    await render(empfehlung)
    expect(link().textContent).toContain('Haferflocken-Knabber')
  })

  test('nie die rohe URL als href - ohne gültige clickUrl gibt es keinen Link', async () => {
    await render({ ...empfehlung, clickUrl: 'https://example.org/knabber' })
    expect(link()).toBeNull()
  })

  test('ohne Bild und Text rendert die Karte trotzdem', async () => {
    await render({ ...empfehlung, bildUrl: null, text: null })
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('h3').textContent).toBe('Haferflocken-Knabber')
  })

  test('labelled={false} (eigenes Portal): kein Kennzeichnungs-Badge, der Link behält rel="sponsored"', async () => {
    await render(anzeige, { labelled: false })
    expect(container.querySelector('.promotion-badge')).toBeNull()
    expect(container.querySelector('.promotion-card-anzeige')).toBeNull()
    expect(container.textContent).not.toContain('Anzeige')
    expect(link().getAttribute('rel')).toBe('sponsored noopener noreferrer')
  })
})

// Phase V4a: Termine einer Anzeige - nur die kommenden, ohne kommende keine Zeile.
describe('PromotionCard – Termine', () => {
  afterEach(() => vi.useRealTimers())

  test('"Termine: …" unter dem Text', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-03T10:00:00'))
    await render({ ...empfehlung, zeitraeume: [{ von: '2026-10-20', bis: null }, { von: '2027-05-05', bis: '2027-05-10' }] })
    expect(container.querySelector('.promotion-card-termine').textContent).toBe('Termine: 20.10., 5.–10.5.2027')
    await render({ ...empfehlung, zeitraeume: [{ von: '2026-01-01', bis: null }] })
    expect(container.querySelector('.promotion-card-termine')).toBeNull()
  })
})
