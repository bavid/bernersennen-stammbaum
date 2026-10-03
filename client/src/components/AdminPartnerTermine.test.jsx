// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { termine, setTerminAusgeblendet, deleteTermin } = vi.hoisted(() => ({
  termine: vi.fn(),
  setTerminAusgeblendet: vi.fn(),
  deleteTermin: vi.fn()
}))
vi.mock('../api', () => ({ api: { admin: { termine, setTerminAusgeblendet, deleteTermin } } }))

import AdminPartnerTermine from './AdminPartnerTermine.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  for (const mock of [termine, setTerminAusgeblendet, deleteTermin]) mock.mockReset()
})

const serie = { id: 7, partnerId: 4, titel: 'Welpenspielstunde', ort: 'Trainingsplatz', datum: '2026-10-10', uhrzeit: '10:00', ende: '11:00', serie: 'woechentlich', serieBis: '2027-10-10', ausgeblendet: false, abgelaufen: false }
const kurs = { ...serie, id: 8, titel: 'Erste-Hilfe-Kurs', ort: null, datum: '2026-11-03', uhrzeit: '18:00', ende: null, serie: 'keine', serieBis: null }

async function render(list = [serie, kurs]) {
  termine.mockResolvedValue(list)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<AdminPartnerTermine partnerId={4} id="admin-partner-termine-4" />))
}

const items = () => [...container.querySelectorAll('.admin-termin')]

describe('AdminPartnerTermine', () => {
  test('alle Termine mit Regel, Uhrzeit und Ort', async () => {
    await render()
    expect(termine).toHaveBeenCalledWith(4)
    expect(items()[0].textContent).toContain('Jeden Samstag, 10:00–11:00 Uhr – ab 10. Oktober 2026 bis 10. Oktober 2027')
    expect(items()[0].textContent).toContain('Trainingsplatz')
    expect(items()[1].textContent).toContain('3. November 2026, 18:00 Uhr')
  })

  test('ausblenden schaltet sofort um, löschen braucht eine Bestätigung', async () => {
    await render()
    setTerminAusgeblendet.mockResolvedValue({ ...serie, ausgeblendet: true })
    await act(async () => items()[0].querySelector('input[role="switch"]').click())
    expect(setTerminAusgeblendet).toHaveBeenCalledWith(7, true)
    expect(items()[0].classList.contains('is-hidden')).toBe(true)

    deleteTermin.mockResolvedValue(null)
    const remove = items()[1].querySelector('.btn-danger')
    await act(async () => remove.click())
    await act(async () => remove.click())
    expect(deleteTermin).toHaveBeenCalledWith(8)
    expect(items()).toHaveLength(1)
  })

  test('ohne Termine ein Hinweis, ein Fehler als Meldung', async () => {
    await render([])
    expect(container.textContent).toContain('Noch keine Termine.')
    termine.mockReset()
    termine.mockRejectedValue(new Error('Nicht erlaubt'))
    act(() => root.unmount())
    root = createRoot(container)
    await act(async () => root.render(<AdminPartnerTermine partnerId={4} id="x" />))
    expect(container.querySelector('[role="alert"]').textContent).toBe('Nicht erlaubt')
  })
})
