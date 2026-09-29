// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { vouchers } = vi.hoisted(() => ({ vouchers: vi.fn() }))
vi.mock('../api', () => ({ api: { partnerArea: { vouchers } } }))

import PartnerVoucherStacks, { EMPTY_HINT, STACKS_HINT } from './PartnerVoucherStacks.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const stacks = [
  { id: 12, label: 'Weitergabe Hundeschule Wiesengrund', quelle: 'weitergabe', size: 5, offen: 4, eingeloest: 1, widerrufen: 0, erstelltAm: '2026-09-20 10:00:00' },
  { id: 7, label: 'Wiesengrund-Karten', quelle: 'admin', size: 3, offen: 0, eingeloest: 2, widerrufen: 1, erstelltAm: '2026-09-01 09:30:00' }
]

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  vouchers.mockReset()
})

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <PartnerVoucherStacks />
      </MemoryRouter>
    )
  )
  return container
}

describe('PartnerVoucherStacks – Liste', () => {
  test('lädt die Stapel und zeigt je Stapel Bezeichnung, Quelle, Anzahl und die drei Zahlen', async () => {
    vouchers.mockResolvedValue({ stapel: stacks })
    await render()

    expect(vouchers).toHaveBeenCalledTimes(1)
    expect(container.querySelector('#partner-vouchers-title').textContent).toBe('Kunden-Gutscheine')
    expect(container.textContent).toContain(STACKS_HINT)
    expect(container.textContent).toContain('2 Stapel')

    const rows = [...container.querySelectorAll('.partner-stack')]
    expect(rows.map((row) => row.querySelector('h3').textContent)).toEqual(['Weitergabe Hundeschule Wiesengrund', 'Wiesengrund-Karten'])
    expect(rows.map((row) => row.querySelector('.partner-stack-quelle').textContent)).toEqual(['weitergegeben', 'vom Betreiber'])
    expect(rows[0].textContent).toContain('5 Karten · seit 20.09.2026')
    const counts = [...rows[0].querySelectorAll('.partner-stack-counts div')].map((el) => `${el.querySelector('dt').textContent}: ${el.querySelector('dd').textContent}`)
    expect(counts).toEqual(['Eingelöst: 1', 'Offen: 4', 'Zurückgezogen: 0'])
    expect(rows[0].querySelector('.stat-bar')).not.toBeNull()
  })

  test('"Karten drucken" führt zur Druckseite des Stapels - nur solange offene Karten da sind', async () => {
    vouchers.mockResolvedValue({ stapel: stacks })
    await render()

    const rows = [...container.querySelectorAll('.partner-stack')]
    const print = rows[0].querySelector('a.partner-stack-print')
    expect(print.getAttribute('href')).toBe('/partner-drucken/12')
    expect(print.textContent).toContain('Karten drucken')
    expect(rows[1].querySelector('a.partner-stack-print')).toBeNull()
    expect(rows[1].textContent).toContain('Keine offenen Karten mehr in diesem Stapel.')
  })

  test('keine Codes in der Liste - nur, was der Server liefert', async () => {
    vouchers.mockResolvedValue({ stapel: stacks })
    await render()
    expect(container.querySelector('.voucher-card')).toBeNull()
    expect(container.querySelector('.voucher-card-code')).toBeNull()
  })
})

describe('PartnerVoucherStacks – leer und Fehler', () => {
  test('ohne Stapel: Hinweis, wie die ersten Karten entstehen', async () => {
    vouchers.mockResolvedValue({ stapel: [] })
    await render()

    expect(container.querySelector('.empty-state').textContent).toContain(EMPTY_HINT)
    expect(container.querySelector('.partner-stack-list')).toBeNull()
    expect(container.textContent).not.toContain('0 Stapel')
  })

  test('ein Fehler beim Laden erscheint als Alert', async () => {
    vouchers.mockRejectedValue(new Error('Fehler 500'))
    await render()

    expect(container.querySelector('[role="alert"]').textContent).toBe('Fehler 500')
    expect(container.querySelector('.partner-stack-list')).toBeNull()
    expect(container.textContent).not.toContain('Lade …')
  })
})
