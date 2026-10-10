// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { eingeloestImZeitraum, formatQuote, zielStand } from '../lib/adminKpi.js'

const { kpi } = vi.hoisted(() => ({ kpi: vi.fn() }))
vi.mock('../api', () => ({ api: { admin: { kpi } } }))

import AdminKpi from './AdminKpi.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

// Antwort von GET /api/admin/stats/kpi (server/lib/adminKpi.js).
function fixture(overrides = {}) {
  return {
    zeitraum: '30',
    ziel: { aktivierung: 50, wiederkommen: 25 },
    aktivierung: { kohorte: 4, erreicht: 3, quote: 75 },
    wiederkommen: { kohorte: 6, erreicht: 1, quote: 16.7 },
    einloesungen: {
      stapel: [],
      kanaele: [
        { kanal: 'FB', stapel: 2, ausgegeben: 40, eingeloest: 5, eingeloestGesamt: 12, quote: 30 },
        { kanal: null, stapel: 1, ausgegeben: 10, eingeloest: 1, eingeloestGesamt: 1, quote: 10 }
      ]
    },
    ...overrides
  }
}

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  kpi.mockReset()
})

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<AdminKpi />))
}

const rows = () =>
  [...container.querySelectorAll('.admin-kpi-row')].map((row) => [
    row.querySelector('dt').textContent,
    row.querySelector('.admin-kpi-value').textContent,
    row.querySelector('.ui-chip')?.className ?? ''
  ])

describe('AdminKpi – Erfolg messen', () => {
  test('zeigt die drei Zahlen mit Ziel-Chip und die Tabelle je Kanal', async () => {
    kpi.mockResolvedValue(fixture())
    await render()

    expect(kpi).toHaveBeenCalledWith('30')
    expect(container.querySelector('h2').textContent).toBe('Erfolg messen')
    const [aktivierung, wiederkommen, einloesungen] = rows()
    expect(aktivierung.slice(0, 2)).toEqual(['Aktivierung', '75 %'])
    expect(aktivierung[2]).toContain('ui-chip--ok')
    expect(wiederkommen.slice(0, 2)).toEqual(['Wiederkommen', '16,7 %'])
    expect(wiederkommen[2]).toContain('ui-chip--wartet')
    expect(einloesungen.slice(0, 2)).toEqual(['Einlösungen', '6'])
    const kanaele = [...container.querySelectorAll('tbody th')].map((th) => th.textContent)
    expect(kanaele).toEqual(['FB', 'Ohne Serie'])
  })

  test('der Zeitraum-Schalter lädt neu', async () => {
    kpi.mockResolvedValue(fixture())
    await render()
    const button = [...container.querySelectorAll('.segmented button')].find((b) => b.textContent === '90 Tage')
    await act(async () => button.click())

    expect(kpi).toHaveBeenLastCalledWith('90')
    expect(button.getAttribute('aria-pressed')).toBe('true')
  })

  test('ohne Kohorte: Strich und neutraler Chip; Fehler als Hinweis', async () => {
    kpi.mockResolvedValue(fixture({ aktivierung: { kohorte: 0, erreicht: 0, quote: null } }))
    await render()
    expect(rows()[0][1]).toBe('–')
    expect(rows()[0][2]).not.toContain('ui-chip--')
    act(() => root.unmount())
    root = null

    kpi.mockRejectedValue(new Error('Kaputt'))
    await render()
    expect(container.querySelector('[role="alert"]').textContent).toBe('Kaputt')
  })
})

describe('lib/adminKpi', () => {
  test('formatQuote, zielStand, eingeloestImZeitraum', () => {
    expect(formatQuote(66.7)).toBe('66,7 %')
    expect(formatQuote(null)).toBe('–')
    expect(zielStand(50, 50)).toBe('ok')
    expect(zielStand(49.9, 50)).toBe('wartet')
    expect(zielStand(null, 50)).toBe('leer')
    expect(eingeloestImZeitraum([{ eingeloest: 2 }, { eingeloest: '3' }, {}])).toBe(5)
    expect(eingeloestImZeitraum(undefined)).toBe(0)
  })
})
