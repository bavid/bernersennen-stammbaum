// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { settings, updateSettings, donationReports, createDonationReport, updateDonationReport, deleteDonationReport } = vi.hoisted(() => ({
  settings: vi.fn(),
  updateSettings: vi.fn(),
  donationReports: vi.fn(),
  createDonationReport: vi.fn(),
  updateDonationReport: vi.fn(),
  deleteDonationReport: vi.fn()
}))
vi.mock('../api', () => ({
  api: { admin: { settings, updateSettings, donationReports, createDonationReport, updateDonationReport, deleteDonationReport } }
}))

import AdminSupport from './AdminSupport.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const EURO = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

let container
let root

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set

function setInputValue(input, value) {
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function setTextareaValue(textarea, value) {
  nativeTextareaValueSetter.call(textarea, value)
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
}

const storedSettings = {
  gofundme_url: 'https://example.org/spenden',
  unterstuetzen_text: 'Jeder Beitrag hilft.',
  demo_gofundme_url: 'https://example.org/demo',
  demo_unterstuetzen_text: 'Demo-Text'
}

const report = {
  id: 5,
  zeitraum: '2026 Q3',
  eingang_cents: 125050,
  kosten_cents: 18000,
  weitergeleitet_cents: 100050,
  empfaenger: 'Tierheim Sonnenhang',
  nachweis_url: 'https://example.org/nachweis',
  is_demo: 0
}

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
  for (const mock of [settings, updateSettings, donationReports, createDonationReport, updateDonationReport, deleteDonationReport]) {
    mock.mockReset()
  }
})

async function render({ reports = [] } = {}) {
  settings.mockResolvedValue(storedSettings)
  donationReports.mockResolvedValue(reports)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<AdminSupport />))
  return container
}

function buttonByText(text) {
  return [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim() === text)
}

const byId = (id) => container.querySelector(`#${id}`)

describe('AdminSupport – GoFundMe-Link und Text', () => {
  test('lädt die Einstellungen in die Felder, speichert nur die echten Schlüssel und meldet "Gespeichert"', async () => {
    await render()
    expect(byId('admin-support-gofundme').value).toBe('https://example.org/spenden')
    expect(byId('admin-support-text').value).toBe('Jeder Beitrag hilft.')

    updateSettings.mockResolvedValue({ ...storedSettings, gofundme_url: 'https://www.example.org/neu', unterstuetzen_text: 'Neu.' })
    await act(async () => {
      setInputValue(byId('admin-support-gofundme'), 'www.example.org/neu')
      setTextareaValue(byId('admin-support-text'), 'Neu.')
    })
    await act(async () => container.querySelector('.admin-support-settings').requestSubmit())

    expect(updateSettings).toHaveBeenCalledWith({ gofundme_url: 'www.example.org/neu', unterstuetzen_text: 'Neu.' })
    expect(container.querySelector('.admin-support-settings [role="status"]').textContent).toBe('Gespeichert.')
    // Der Server normalisiert die Adresse - das Feld zeigt danach seinen Wert.
    expect(byId('admin-support-gofundme').value).toBe('https://www.example.org/neu')

    // Weiteres Tippen nimmt die Bestätigung wieder weg (die Live-Region selbst bleibt stehen).
    await act(async () => setTextareaValue(byId('admin-support-text'), 'Neu!'))
    expect(container.querySelector('.admin-support-settings [role="status"]').textContent).toBe('')
  })

  test('ein Server-Fehler zur Adresse steht am Feld', async () => {
    await render()
    updateSettings.mockRejectedValue(new Error('gofundme_url: ungültige Adresse'))
    await act(async () => container.querySelector('.admin-support-settings').requestSubmit())

    expect(byId('admin-support-gofundme-error').textContent).toBe('Der GoFundMe-Link: ungültige Adresse')
    expect(byId('admin-support-gofundme').getAttribute('aria-invalid')).toBe('true')
    expect(container.querySelector('.admin-support-settings [role="status"]').textContent).toBe('')
  })
})

describe('AdminSupport – Spendenberichte', () => {
  test('zeigt Beträge als Euro (de-DE) statt Cent', async () => {
    await render({ reports: [report] })

    const row = container.querySelector('.admin-report-row')
    expect(row.textContent).toContain('2026 Q3')
    expect(row.textContent).toContain(EURO.format(1250.5))
    expect(row.textContent).toContain(EURO.format(180))
    expect(row.textContent).toContain(EURO.format(1000.5))
    expect(row.textContent).toContain('Tierheim Sonnenhang')
    expect(row.textContent).not.toContain('125050')
  })

  test('Anlegen: Euro-Eingaben (deutsch oder mit Punkt) gehen als Cent in den Request', async () => {
    await render()
    createDonationReport.mockResolvedValue({ ...report, id: 6 })

    await act(async () => buttonByText('Bericht anlegen').click())
    await act(async () => {
      setInputValue(byId('admin-report-zeitraum'), '2026 Q3')
      setInputValue(byId('admin-report-eingang'), '1.250,50')
      setInputValue(byId('admin-report-kosten'), '180')
      setInputValue(byId('admin-report-weitergeleitet'), '1000.5')
      setInputValue(byId('admin-report-empfaenger'), 'Tierheim Sonnenhang')
    })
    // Vorschau zeigt, wie der Betrag verstanden wurde.
    expect(byId('admin-report-eingang-hint').textContent).toContain(EURO.format(1250.5))

    donationReports.mockResolvedValue([{ ...report, id: 6 }])
    await act(async () => container.querySelector('.admin-report-form').requestSubmit())

    expect(createDonationReport).toHaveBeenCalledWith({
      zeitraum: '2026 Q3',
      eingangCents: 125050,
      kostenCents: 18000,
      weitergeleitetCents: 100050,
      empfaenger: 'Tierheim Sonnenhang',
      nachweisUrl: null
    })
    expect(container.querySelector('.admin-report-form')).toBeNull()
    expect(donationReports).toHaveBeenCalledTimes(2)
  })

  test('negative oder unlesbare Beträge werden am Feld abgelehnt und nicht gesendet', async () => {
    await render()
    await act(async () => buttonByText('Bericht anlegen').click())
    await act(async () => {
      setInputValue(byId('admin-report-zeitraum'), '2026 Q3')
      setInputValue(byId('admin-report-eingang'), '-5')
      setInputValue(byId('admin-report-kosten'), 'viel')
      setInputValue(byId('admin-report-weitergeleitet'), '0')
    })
    await act(async () => container.querySelector('.admin-report-form').requestSubmit())

    expect(createDonationReport).not.toHaveBeenCalled()
    expect(byId('admin-report-eingang-error')).not.toBeNull()
    expect(byId('admin-report-kosten-error')).not.toBeNull()
    expect(byId('admin-report-weitergeleitet-error')).toBeNull()
  })

  test('Bearbeiten: Beträge als Euro vorbefüllt, updateDonationReport mit id und Cent', async () => {
    await render({ reports: [report] })
    updateDonationReport.mockResolvedValue(report)

    await act(async () => buttonByText('Bearbeiten').click())
    expect(byId('admin-report-eingang').value).toBe('1250,50')

    await act(async () => setInputValue(byId('admin-report-eingang'), '1.300'))
    await act(async () => container.querySelector('.admin-report-form').requestSubmit())

    expect(updateDonationReport).toHaveBeenCalledWith(5, expect.objectContaining({ eingangCents: 130000, kostenCents: 18000 }))
  })

  test('Server-Fehler zum Nachweis-Link erscheint am Feld', async () => {
    await render({ reports: [report] })
    updateDonationReport.mockRejectedValue(new Error('Der Nachweis-Link: ungültige Adresse'))

    await act(async () => buttonByText('Bearbeiten').click())
    await act(async () => container.querySelector('.admin-report-form').requestSubmit())

    expect(byId('admin-report-nachweis-error').textContent).toBe('Der Nachweis-Link: ungültige Adresse')
  })

  test('Löschen fragt erst nach (Bestätigung), dann deleteDonationReport', async () => {
    await render({ reports: [report] })
    deleteDonationReport.mockResolvedValue(null)

    const deleteButton = [...container.querySelectorAll('.admin-report-row button')].find((btn) => btn.textContent.includes('Löschen'))
    donationReports.mockResolvedValue([])
    await act(async () => deleteButton.click())
    expect(deleteDonationReport).not.toHaveBeenCalled()

    await act(async () => container.querySelector('.admin-report-row button.is-armed').click())
    expect(deleteDonationReport).toHaveBeenCalledWith(5)
    expect(container.querySelector('.admin-report-row')).toBeNull()
  })
})
