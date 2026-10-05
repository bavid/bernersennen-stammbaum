// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  finanzierung: vi.fn(),
  saveFinanzierungHinweis: vi.fn(),
  saveFinanzierungZiel: vi.fn(),
  createFinanzierungQuartal: vi.fn(),
  updateFinanzierungQuartal: vi.fn(),
  deleteFinanzierungQuartal: vi.fn()
}))
vi.mock('../api', () => ({
  ApiError: class ApiError extends Error {
    constructor(message, status, details = {}) {
      super(message)
      this.status = status
      this.details = details
    }
  },
  api: { admin: mocks }
}))

import AdminFinanzierung from './AdminFinanzierung.jsx'
import { ApiError } from '../api'

// Phase F: Reiter „Finanzierung“ - Spenden-Hinweis, Ziel und Quartale mit Vorschau der öffentlichen Seite.
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const EMPTY = { spendenHinweis: { text: '', url: null }, ziel: { titel: '', betragCents: null, empfaenger: null }, quartale: [] }
const Q1 = { id: 7, jahr: 2026, quartal: 1, einnahmenSpendenCents: 12050, einnahmenPartnerCents: 0, kostenCents: 8900, spendenWeitergegebenCents: 3000, notiz: 'Server', updatedAt: '2026-04-02 10:00:00' }

let container
let root

beforeEach(() => {
  mocks.finanzierung.mockResolvedValue(EMPTY)
})

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  for (const mock of Object.values(mocks)) mock.mockReset()
})

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <AdminFinanzierung />
      </MemoryRouter>
    )
  )
}

const field = (id) => container.querySelector(`#${id}`)
const button = (text) => [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim().startsWith(text))

async function type(element, value) {
  const proto = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
  await act(async () => {
    setter.call(element, value)
    element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  })
}

async function submit(form) {
  await act(async () => form.requestSubmit())
}

const click = (el) => act(async () => el.click())

describe('AdminFinanzierung', () => {
  test('lädt: zwei Karten, Link zur Seite, Leerzustände der Vorschau', async () => {
    await render()
    expect(container.querySelector('h2').textContent).toBe('So finanzieren wir uns')
    expect(container.querySelector('a[href="/finanzierung"]').getAttribute('target')).toBe('_blank')
    expect(container.textContent).toContain('Kein Ziel eingetragen.')
    expect(container.textContent).toContain('Ohne Spenden-Hinweis zeigt die Seite keine Karte „Mithelfen“.')
    expect(container.textContent).toContain('Die ersten Zahlen veröffentlichen wir nach dem ersten Quartal.')
    expect(container.textContent).not.toMatch(/merch|shop/i)
  })

  test('Spenden-Hinweis speichern: getrimmt an die API, danach in der Vorschau; Serverfehler am Feld', async () => {
    mocks.saveFinanzierungHinweis.mockResolvedValue({ spendenHinweis: { text: 'Spendenkonto folgt.', url: 'https://example.org/spenden' } })
    await render()
    await type(field('admin-finanz-text'), ' Spendenkonto folgt. ')
    await type(field('admin-finanz-url'), 'https://example.org/spenden')
    await submit(field('admin-finanz-text').closest('form'))

    expect(mocks.saveFinanzierungHinweis).toHaveBeenCalledWith({ text: 'Spendenkonto folgt.', url: 'https://example.org/spenden' })
    const preview = container.querySelector('.admin-finanz-preview .finanz-mithelfen')
    expect(preview.textContent).toContain('Spendenkonto folgt.')
    expect(preview.querySelector('a').getAttribute('href')).toBe('https://example.org/spenden')
    expect(container.querySelector('[role="status"]').textContent).toBe('Gespeichert.')

    mocks.saveFinanzierungHinweis.mockRejectedValue(new ApiError('Der Link: bitte eine vollständige Adresse mit http(s).', 400, { feld: 'url' }))
    await type(field('admin-finanz-url'), 'mailto:x')
    await submit(field('admin-finanz-text').closest('form'))
    expect(field('admin-finanz-url').getAttribute('aria-invalid')).toBe('true')
    expect(field('admin-finanz-url-error').textContent).toMatch(/vollständige Adresse/)
  })

  test('Ziel: Euro -> Cent, Vorschau als Satz; ungültiger Betrag bleibt beim Client', async () => {
    mocks.saveFinanzierungZiel.mockResolvedValue({ ziel: { titel: 'Hundewiese', betragCents: 50000, empfaenger: 'Stadt' } })
    await render()
    await type(field('admin-finanz-titel'), 'Hundewiese')
    await type(field('admin-finanz-betrag'), '500')
    await type(field('admin-finanz-empfaenger'), 'Stadt')
    await submit(field('admin-finanz-titel').closest('form'))
    expect(mocks.saveFinanzierungZiel).toHaveBeenCalledWith({ titel: 'Hundewiese', betragCents: 50000, empfaenger: 'Stadt' })
    expect(container.querySelector('.admin-finanz-preview .finanz-ziel').textContent).toMatch(/Ziel: 500,00\s€ für Hundewiese/)

    await type(field('admin-finanz-betrag'), 'viel')
    await submit(field('admin-finanz-titel').closest('form'))
    expect(mocks.saveFinanzierungZiel).toHaveBeenCalledTimes(1)
    expect(field('admin-finanz-betrag-error').textContent).toMatch(/Betrag/)
  })

  test('Quartal eintragen: Formular, Euro -> Cent, Liste und Vorschau danach; Fehler am Feld; Löschen zweistufig', async () => {
    mocks.createFinanzierungQuartal.mockResolvedValue(Q1)
    mocks.deleteFinanzierungQuartal.mockResolvedValue(null)
    await render()
    expect(container.querySelector('.admin-quartal-form')).toBeNull()
    await click(button('Quartal eintragen'))

    // Client-Prüfung: Jahr außerhalb -> Fehler am Feld, kein Aufruf.
    await type(field('admin-quartal-jahr'), '1999')
    await submit(container.querySelector('.admin-quartal-form'))
    expect(mocks.createFinanzierungQuartal).not.toHaveBeenCalled()
    expect(field('admin-quartal-jahr-error').textContent).toMatch(/2024/)

    await type(field('admin-quartal-jahr'), '2026')
    await type(field('admin-quartal-quartal'), '1')
    await type(field('admin-quartal-einnahmenSpenden'), '120,50')
    await type(field('admin-quartal-kosten'), '89')
    await type(field('admin-quartal-spendenWeitergegeben'), '30')
    await type(field('admin-quartal-notiz'), 'Server')
    await submit(container.querySelector('.admin-quartal-form'))
    expect(mocks.createFinanzierungQuartal).toHaveBeenCalledWith({
      jahr: 2026,
      quartal: 1,
      einnahmenSpendenCents: 12050,
      einnahmenPartnerCents: 0,
      kostenCents: 8900,
      spendenWeitergegebenCents: 3000,
      notiz: 'Server'
    })
    expect(container.querySelector('.admin-quartal-form')).toBeNull()
    expect(container.querySelector('.admin-quartal-row strong').textContent).toBe('1. Quartal 2026')
    expect(container.querySelector('.admin-finanz-preview-wide .finanz-quartal h3').textContent).toBe('1. Quartal 2026')

    // Löschen: erst scharf schalten, dann bestätigen.
    const del = container.querySelector('.admin-quartal-actions button[aria-label="1. Quartal 2026 löschen"]')
    await click(del)
    expect(mocks.deleteFinanzierungQuartal).not.toHaveBeenCalled()
    await click(container.querySelector('.admin-quartal-actions button[aria-label="1. Quartal 2026 löschen"]') || del)
    expect(mocks.deleteFinanzierungQuartal).toHaveBeenCalledWith(7)
    expect(container.querySelector('.admin-quartal-row')).toBeNull()
  })

  test('Quartal ändern: Formular vorbelegt, Serverfehler (409) als Banner', async () => {
    mocks.finanzierung.mockResolvedValue({ ...EMPTY, quartale: [Q1] })
    mocks.updateFinanzierungQuartal.mockRejectedValue(new ApiError('Dieses Quartal gibt es schon', 409))
    await render()
    await click(button('Bearbeiten'))
    expect(field('admin-quartal-einnahmenSpenden').value).toBe('120,50')
    expect(field('admin-quartal-notiz').value).toBe('Server')
    await submit(container.querySelector('.admin-quartal-form'))
    expect(mocks.updateFinanzierungQuartal).toHaveBeenCalledWith(7, expect.objectContaining({ jahr: 2026, quartal: 1, kostenCents: 8900 }))
    expect(container.querySelector('.admin-quartal-form [role="alert"]').textContent).toMatch(/gibt es schon/)
  })
})
