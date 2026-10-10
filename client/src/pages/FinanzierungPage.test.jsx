// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { finanzierung } = vi.hoisted(() => ({ finanzierung: vi.fn() }))
// „Spenden live“ hat eigene Tests (SpendenLive.test.jsx) - hier ohne Live-Daten (Block bleibt weg).
vi.mock('../api', () => ({ api: { finanzierung, finanzierungLive: () => Promise.reject(new Error('offline')) } }))

import FinanzierungPage, { GRUNDSATZ } from './FinanzierungPage.jsx'
import { QUARTALE_LEER } from '../components/finanzierung/FinanzierungQuartale.jsx'
import { REGEL_TEXT } from '../lib/finanzierungRuecklage.js'

// Phase F: /finanzierung - „So finanzieren wir uns“. Mit Admin-Daten (Ziel, Quartale, Spenden-Hinweis) und ohne.
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
  finanzierung.mockReset()
})

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={['/finanzierung']}>
        <FinanzierungPage />
      </MemoryRouter>
    )
  )
}

const EMPTY = { spendenHinweis: null, ziel: null, quartale: [] }
const FULL = {
  spendenHinweis: { text: 'Spendenkonto: Familie auf Pfoten\nVerwendungszweck: Server', url: 'https://example.org/spenden' },
  ziel: { titel: 'Hundewiese am Deich', betragCents: 50000, empfaenger: 'Stadt' },
  quartale: [
    { jahr: 2026, quartal: 2, einnahmenSpendenCents: 24100, einnahmenPartnerCents: 0, kostenCents: 8900, spendenWeitergegebenCents: 3000, notiz: null },
    { jahr: 2026, quartal: 1, einnahmenSpendenCents: 12050, einnahmenPartnerCents: 0, kostenCents: 8900, spendenWeitergegebenCents: 0, notiz: 'Server und Domain' }
  ]
}

const headings = () => [...container.querySelectorAll('h2')].map((h) => h.textContent)
const text = () => container.textContent

describe('FinanzierungPage', () => {
  test('ohne Admin-Daten: Grundsatz, wer zahlt was, wohin das Geld geht, Leerzustand der Zahlen - keine Karte „Mithelfen“, kein Ziel', async () => {
    finanzierung.mockResolvedValue(EMPTY)
    await render()

    expect(container.querySelector('h1').textContent).toBe('So finanzieren wir uns')
    expect(container.querySelector('.finanz-hero-hand').textContent).toBe(GRUNDSATZ)
    expect(headings()).toEqual(['Unser Grundsatz', 'Wer zahlt was', 'Wohin das Geld geht', 'Zahlen je Quartal'])
    // Drei Zeilen „Wer zahlt was“ mit den Beiträgen.
    const rows = [...container.querySelectorAll('.finanz-wer-row')].map((row) => [row.querySelector('dt').textContent, row.querySelector('.pill').textContent])
    expect(rows).toEqual([
      ['Nutzerinnen und Nutzer', 'heute kostenlos'],
      ['Partner-Portale', 'heute kostenlos'],
      ['Hervorhebung „überall sichtbar“', 'heute kostenlos']
    ])
    expect(container.textContent).toContain('klar als „überall sichtbar“ gekennzeichnet')
    // Ehrlich statt Versprechen: kein „für immer“, kein „vorerst“ (Wunsch 05.10.) - dafür der Satz, wie es weitergeht.
    expect(container.textContent).not.toMatch(/für immer|bleibt es|vorerst/)
    expect(container.textContent).toContain('Sollte sich daran etwas ändern, sagen wir es rechtzeitig und offen')
    expect(container.textContent).toContain('Grundfunktionen')
    expect(container.querySelector('.finanz-empty').textContent).toBe(QUARTALE_LEER)
    expect(container.querySelector('.finanz-mithelfen')).toBeNull()
    expect(container.querySelector('.finanz-ziel')).toBeNull()
    expect(container.querySelector('.finanz-quartale')).toBeNull()
  })

  test('Wortwahl: nie „ohne Werbung“, keine Rechtsform als Tatsache, kein Merch', async () => {
    finanzierung.mockResolvedValue(FULL)
    await render()
    const t = text()
    expect(t).toMatch(/Keine fremde Werbung/)
    expect(t).not.toMatch(/ohne Werbung/i)
    expect(t).not.toMatch(/\be\. ?V\.|gGmbH|gemeinnützig|Verein\b/i)
    expect(t).not.toMatch(/merch|shop/i)
  })

  test('mit Admin-Daten: Ziel-Satz, Quartale neueste zuerst mit Balken und Zahlen als Text, Karte „Mithelfen“ mit Text und Link', async () => {
    finanzierung.mockResolvedValue(FULL)
    await render()

    expect(container.querySelector('.finanz-ziel').textContent).toMatch(/Ziel: 500,00\s€ für Hundewiese am Deich – Empfänger: Stadt/)

    const quartale = [...container.querySelectorAll('.finanz-quartal')]
    expect(quartale.map((q) => q.querySelector('h3').textContent)).toEqual(['2. Quartal 2026', '1. Quartal 2026'])
    const rows = [...quartale[0].querySelectorAll('.finanz-row')]
    expect(rows.map((row) => row.querySelector('dt').textContent)).toEqual(['Einnahmen', 'Kosten', 'Weitergegeben'])
    expect(rows[0].querySelector('.finanz-value').textContent).toMatch(/^241,00\s€$/)
    // Balken: größter Wert aller Quartale (241 €) = 100 %, Kosten 89 € ≈ 36,9 %; reine Darstellung (aria-hidden).
    expect(rows[0].querySelector('.finanz-bar-fill').style.width).toBe('100%')
    expect(Number.parseFloat(rows[1].querySelector('.finanz-bar-fill').style.width)).toBeCloseTo(36.9, 0)
    expect(rows[0].querySelector('.finanz-bar').getAttribute('aria-hidden')).toBe('true')
    expect(quartale[1].querySelector('.finanz-quartal-detail').textContent).toMatch(/Server und Domain/)
    expect(container.querySelector('.finanz-quartale').getAttribute('aria-label')).toBe('Zahlen je Quartal')

    const mithelfen = container.querySelector('.finanz-mithelfen')
    expect(mithelfen.querySelector('h2').textContent).toBe('Mithelfen')
    expect(mithelfen.querySelector('.finanz-mithelfen-text').textContent).toContain('Spendenkonto: Familie auf Pfoten')
    expect(mithelfen.querySelectorAll('.finanz-mithelfen-text br')).toHaveLength(1)
    const link = mithelfen.querySelector('a')
    expect(link.getAttribute('href')).toBe('https://example.org/spenden')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    // Kein Zahlungsformular in der App.
    expect(mithelfen.querySelector('form, input')).toBeNull()
  })

  test('Kosten & Reserve: Regel in Worten, Rücklage-Anzeige, Stand ehrlich im Minus, Verteilung je Quartal', async () => {
    finanzierung.mockResolvedValue({
      ...FULL,
      kosten: { proJahrCents: 28800, posten: [{ titel: 'Server', betragCents: 2300, intervall: 'monat' }, { titel: 'Domain', betragCents: 1200, intervall: 'jahr' }] },
      saldoCents: -34000,
      ruecklage: { centsAktuell: 11520, jahreGedeckt: 0.4, anteilProzent: 20 },
      verteilung: [
        { jahr: 2026, quartal: 1, kostenCents: 15800, ueberschussCents: 0, anteilProzent: 20, reserveCents: 0, gespendetCents: 0, entnahmeCents: 0, ruecklageDanachCents: 0 },
        { jahr: 2026, quartal: 2, kostenCents: 15800, ueberschussCents: 8300, anteilProzent: 20, reserveCents: 1660, gespendetCents: 6640, entnahmeCents: 0, ruecklageDanachCents: 1660 }
      ]
    })
    await render()
    const regel = container.querySelector('.finanz-regel')
    expect(regel.textContent).toContain(REGEL_TEXT)
    expect(regel.querySelector('[aria-current="step"]').textContent).toMatch(/unter 1 Jahr.*20 %/)
    expect(regel.querySelector('.ruecklage-anzeige').textContent).toContain('Rücklage: deckt 0,4 Jahre')
    const stand = container.querySelector('.finanz-stand')
    expect(stand.textContent).toMatch(/288,00\s€/)
    expect(stand.textContent).toMatch(/Server: 23,00\s€ im Monat · Domain: 12,00\s€ im Jahr/)
    expect(stand.textContent).toMatch(/Zurzeit tragen wir 340,00\s€ selbst\./)
    const verteilung = [...container.querySelectorAll('.finanz-quartal-verteilung')].map((p) => p.textContent)
    expect(verteilung[0]).toMatch(/Überschuss 83,00\s€: Rücklage 16,60\s€ \(20 %\) · zum Spenden 66,40\s€/)
    expect(verteilung[1]).toMatch(/Kein Überschuss/)
    // Kosten im Balken samt laufender Posten (158 €), nicht nur die einmaligen 89 €.
    const kosten = container.querySelectorAll('.finanz-quartal')[0].querySelectorAll('.finanz-row')[1]
    expect(kosten.querySelector('.finanz-value').textContent).toMatch(/^158,00\s€$/)
  })

  test('ohne Zahlen: die Regel steht da, aber keine Rücklage-Anzeige und kein Stand', async () => {
    finanzierung.mockResolvedValue({ ...EMPTY, kosten: { proJahrCents: 0, posten: [] }, saldoCents: 0, ruecklage: { centsAktuell: 0, jahreGedeckt: null, anteilProzent: 0 }, verteilung: [] })
    await render()
    expect(container.querySelector('.finanz-regel').textContent).toContain(REGEL_TEXT)
    expect(container.querySelector('.ruecklage-anzeige')).toBeNull()
    expect(container.querySelector('[aria-current="step"]')).toBeNull()
    expect(container.querySelector('.finanz-stand')).toBeNull()
  })

  test('nur Text ohne Link: Karte ohne Knopf; ein unsicherer Link landet nie im href', async () => {
    finanzierung.mockResolvedValue({ ...EMPTY, spendenHinweis: { text: 'Spendenkonto folgt.', url: 'javascript:alert(1)' } })
    await render()
    const mithelfen = container.querySelector('.finanz-mithelfen')
    expect(mithelfen.textContent).toContain('Spendenkonto folgt.')
    expect(mithelfen.querySelector('a')).toBeNull()
  })

  test('Ladefehler: die Seite steht trotzdem, nur die Zahlen fehlen mit Hinweis', async () => {
    finanzierung.mockRejectedValue(new Error('kaputt'))
    await render()
    expect(container.querySelector('h1').textContent).toBe('So finanzieren wir uns')
    expect(container.querySelector('[role="status"]').textContent).toMatch(/gerade nicht laden/)
    expect(container.querySelector('.finanz-mithelfen')).toBeNull()
  })

  test('Überschriften in Reihenfolge, Fuß mit Impressum und Datenschutz', async () => {
    finanzierung.mockResolvedValue(FULL)
    await render()
    const levels = [...container.querySelectorAll('h1, h2, h3')].map((h) => Number(h.tagName[1]))
    // Nie eine Stufe überspringen (h1 -> h2 -> h3).
    levels.reduce((previous, level) => {
      expect(level - previous).toBeLessThanOrEqual(1)
      return level
    }, 0)
    const footerLinks = [...container.querySelectorAll('.public-footer a')].map((a) => a.getAttribute('href'))
    expect(footerLinks).toEqual(['/impressum', '/datenschutz'])
  })
})
