// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createFinanzierungKosten: vi.fn(), updateFinanzierungKosten: vi.fn(), deleteFinanzierungKosten: vi.fn() }))
vi.mock('../api', () => ({ api: { admin: mocks } }))

import AdminFinanzierungKosten from './AdminFinanzierungKosten.jsx'

// „Kosten & Reserve“ im Admin: Zusammenfassung der Server-Rechnung, Posten anlegen/ändern/löschen, Vorschau der Regel.
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const SERVER = { id: 3, titel: 'Server', betragCents: 2300, intervall: 'monat', ab: '2026-01-01', bis: null, notiz: 'Tarif S', updatedAt: '2026-10-01 10:00:00' }
const DATA = {
  kosten: { proJahrCents: 27600, posten: [SERVER] },
  prognose: { kostenBisherCents: 59000, spendenBisherCents: 25000, saldoCents: -34000, restKostenJahrCents: 4600, prognoseJahresendeCents: -38600 },
  ruecklage: { centsAktuell: 0, jahreGedeckt: 0, anteilProzent: 20 },
  verteilung: []
}

let container
let root

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  Object.values(mocks).forEach((mock) => mock.mockReset())
})

async function render(data = DATA, onChanged = vi.fn()) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<AdminFinanzierungKosten data={data} onChanged={onChanged} />))
  return onChanged
}

const byId = (id) => container.querySelector(`#${id}`)
const setValue = async (element, value) => {
  const proto = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value)
  await act(async () => element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })))
}
const click = async (element) => act(async () => element.click())
const submit = async (form) => act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))

describe('AdminFinanzierungKosten', () => {
  test('Zusammenfassung: Jahreskosten, Spenden bisher, Saldo rot im Minus, Prognose bis Jahresende; Posten-Liste; Regel als Vorschau', async () => {
    await render()
    expect(container.querySelector('h2').textContent).toBe('Kosten & Reserve')
    const summary = container.querySelector('.admin-kosten-summary')
    expect(summary.textContent).toMatch(/276,00\s€/)
    expect(summary.textContent).toMatch(/250,00\s€/)
    const saldo = summary.querySelector('.is-minus')
    expect(saldo.textContent).toMatch(/Du bist 340,00\s€ im Minus/)
    expect(container.querySelector('.admin-kosten-prognose').textContent).toMatch(/fehlen bis Jahresende 386,00\s€/)
    expect(container.querySelector('.admin-quartal-row').textContent).toMatch(/Server: 23,00\s€ im Monat.*seit 01\.01\.2026.*Tarif S/)
    expect(container.querySelector('.finanz-regel [aria-current="step"]').textContent).toMatch(/20 %/)
  })

  test('Posten eintragen: Euro -> Cent an die API, danach onChanged; Fehler bleibt beim Client', async () => {
    mocks.createFinanzierungKosten.mockResolvedValue({ ...SERVER, id: 4 })
    const onChanged = await render({ ...DATA, kosten: { proJahrCents: 0, posten: [] } })
    expect(container.textContent).toContain('Noch keine laufenden Kosten eingetragen.')
    await click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Posten eintragen'))
    await submit(container.querySelector('.admin-kosten-form'))
    expect(mocks.createFinanzierungKosten).not.toHaveBeenCalled()
    expect(byId('admin-kosten-titel-error').textContent).toMatch(/Titel/)

    await setValue(byId('admin-kosten-titel'), 'Domain')
    await setValue(byId('admin-kosten-betrag'), '12')
    await setValue(byId('admin-kosten-intervall'), 'jahr')
    await setValue(byId('admin-kosten-ab'), '2026-03-15')
    await submit(container.querySelector('.admin-kosten-form'))
    expect(mocks.createFinanzierungKosten).toHaveBeenCalledWith({ titel: 'Domain', betragCents: 1200, intervall: 'jahr', ab: '2026-03-15', bis: null, notiz: '' })
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.admin-kosten-form')).toBeNull()
  })

  test('Posten ändern und zweistufig löschen', async () => {
    mocks.updateFinanzierungKosten.mockResolvedValue({ ...SERVER, betragCents: 2500 })
    mocks.deleteFinanzierungKosten.mockResolvedValue(null)
    const onChanged = await render()
    await click([...container.querySelectorAll('.admin-quartal-actions button')].find((b) => b.textContent.startsWith('Bearbeiten')))
    expect(byId('admin-kosten-betrag').value).toBe('23,00')
    await setValue(byId('admin-kosten-betrag'), '25')
    await submit(container.querySelector('.admin-kosten-form'))
    expect(mocks.updateFinanzierungKosten).toHaveBeenCalledWith(3, expect.objectContaining({ betragCents: 2500, notiz: 'Tarif S' }))

    const del = () => container.querySelector('.admin-quartal-actions button[aria-label="Server löschen"]')
    await click(del())
    expect(mocks.deleteFinanzierungKosten).not.toHaveBeenCalled()
    await click(container.querySelector('.admin-quartal-actions .btn-danger, .admin-quartal-actions button[aria-label="Server löschen"]'))
    expect(mocks.deleteFinanzierungKosten).toHaveBeenCalledWith(3)
    expect(onChanged).toHaveBeenCalledTimes(2)
  })
})
