// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test } from 'vitest'
import SupportBlock from './SupportBlock.jsx'

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

async function render(support) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <SupportBlock support={support} />
      </MemoryRouter>
    )
  )
  return container
}

const plain = (text) => text.replace(/ /g, ' ')

const bericht = {
  zeitraum: '2026 Q2',
  eingangCents: 98050,
  kostenCents: 12000,
  weitergeleitetCents: 80000,
  empfaenger: 'Tierheim Birkenweg',
  nachweisUrl: 'https://example.org/nachweis-q2.pdf'
}

const fullSupport = {
  gofundmeClickUrl: '/r/gofundme/0',
  text: 'Jeder Euro hilft Tieren in Vermittlung.',
  bericht,
  partnerSpenden: [
    { id: 3, slug: 'tierheim-birkenweg', name: 'Tierheim Birkenweg', logoUrl: null, url: 'https://example.org/spenden', clickUrl: '/r/partner-spende/3' }
  ],
  promotions: []
}

// Empfehlung des Bereichs "unterstuetzen" (Form wie server/routes/discover.js promotionCard)
const futterspende = {
  id: 40,
  kind: 'promotion',
  bereich: 'unterstuetzen',
  kennzeichnung: 'Empfehlung',
  empfohlenVon: 'Familie auf Pfoten',
  titel: 'Futterspende fürs Tierheim',
  text: 'Futter über eine Wunschliste bestellen.',
  bildUrl: null,
  tierart: null,
  url: 'https://example.org/futterspende',
  clickUrl: '/r/promotion/40'
}

function linkByText(text) {
  return [...container.querySelectorAll('a')].find((a) => a.textContent.includes(text))
}

describe('SupportBlock', () => {
  test('GoFundMe-Knopf führt über die Klickzählung', async () => {
    await render(fullSupport)
    const button = linkByText('GoFundMe')
    expect(button.getAttribute('href')).toBe('/r/gofundme/0')
    expect(button.getAttribute('target')).toBe('_blank')
    expect(button.getAttribute('rel')).toBe('noopener noreferrer')
  })

  test('zeigt den Unterstützen-Text', async () => {
    await render(fullSupport)
    expect(container.textContent).toContain('Jeder Euro hilft Tieren in Vermittlung.')
  })

  test('Transparenzblock: Beträge deutsch formatiert (Cent → Euro) mit Zeitraum', async () => {
    await render(fullSupport)
    const text = plain(container.querySelector('.support-report').textContent)
    expect(text).toContain('Eingang')
    expect(text).toContain('980,50 €')
    expect(text).toContain('Kosten gedeckt')
    expect(text).toContain('120,00 €')
    expect(text).toContain('an Tierheime weitergegeben')
    expect(text).toContain('800,00 €')
    expect(text).toContain('2026 Q2')
    expect(text).toContain('Tierheim Birkenweg')
  })

  test('Nachweis-Link nur bei http(s)', async () => {
    await render(fullSupport)
    expect(linkByText('Nachweis').getAttribute('href')).toBe('https://example.org/nachweis-q2.pdf')

    act(() => root.unmount())
    root = null
    container.remove()
    await render({ ...fullSupport, bericht: { ...bericht, nachweisUrl: 'javascript:alert(1)' } })
    expect(linkByText('Nachweis')).toBeUndefined()
  })

  test('ohne Bericht kein Transparenzblock', async () => {
    await render({ ...fullSupport, bericht: null })
    expect(container.querySelector('.support-report')).toBeNull()
  })

  test('Spendenlinks der Partner-Tierheime über /r/partner-spende/...', async () => {
    await render(fullSupport)
    const link = linkByText('Tierheim Birkenweg')
    expect(link.getAttribute('href')).toBe('/r/partner-spende/3')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  test('Partner-Logo im Spendenlink ist dekorativ (Name steht schon im Linktext)', async () => {
    await render({
      ...fullSupport,
      partnerSpenden: [{ ...fullSupport.partnerSpenden[0], logoUrl: '/partner-media/birkenweg.png' }]
    })
    const link = linkByText('Tierheim Birkenweg')
    const logo = link.querySelector('img')
    expect(logo.getAttribute('src')).toBe('/partner-media/birkenweg.png')
    expect(logo.getAttribute('alt')).toBe('')
  })

  test('ohne irgendetwas: freundlicher Leerzustand mit Link zur Partnerliste', async () => {
    await render({ gofundmeClickUrl: null, text: null, bericht: null, partnerSpenden: [], promotions: [] })
    expect(container.textContent).toContain('Noch keine Spendenmöglichkeiten hinterlegt – schaut in die Partnerliste.')
    expect(linkByText('Partnerliste').getAttribute('href')).toBe('/partner')
  })

  test('ohne GoFundMe aber mit Partner-Spenden: kein Knopf, aber die Liste', async () => {
    await render({ ...fullSupport, gofundmeClickUrl: null })
    expect(linkByText('GoFundMe')).toBeUndefined()
    expect(linkByText('Tierheim Birkenweg')).toBeDefined()
  })

  test('Empfehlungen stehen direkt unter dem GoFundMe-Aufruf, vor Transparenzblock und Spendenlinks', async () => {
    await render({ ...fullSupport, promotions: [futterspende] })
    const card = container.querySelector('.support-block > .promotion-list .promotion-card')
    expect(card.querySelector('h3').textContent).toBe('Futterspende fürs Tierheim')
    expect(card.querySelector('.promotion-badge').textContent).toBe('Empfehlung von Familie auf Pfoten')
    const follows = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(follows(container.querySelector('.support-cta'), card)).toBe(true)
    expect(follows(card, container.querySelector('.support-report'))).toBe(true)
    expect(follows(card, container.querySelector('.support-donations'))).toBe(true)
  })

  test('nur Empfehlungen: kein Leerzustand, sondern die Empfehlung', async () => {
    await render({ gofundmeClickUrl: null, text: null, bericht: null, partnerSpenden: [], promotions: [futterspende] })
    expect(container.textContent).not.toContain('Noch keine Spendenmöglichkeiten')
    expect(container.querySelector('.promotion-card h3').textContent).toBe('Futterspende fürs Tierheim')
  })

  test('ohne Empfehlungen keine leere Empfehlungsliste', async () => {
    await render(fullSupport)
    expect(container.querySelector('.promotion-list')).toBeNull()
  })
})
