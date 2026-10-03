// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { termine, createTermin, updateTermin, deleteTermin, absagenTermin, wiederTermin } = vi.hoisted(() => ({
  termine: vi.fn(),
  createTermin: vi.fn(),
  updateTermin: vi.fn(),
  deleteTermin: vi.fn(),
  absagenTermin: vi.fn(),
  wiederTermin: vi.fn()
}))
vi.mock('../api', () => ({ api: { partnerArea: { termine, createTermin, updateTermin, deleteTermin, absagenTermin, wiederTermin } } }))

import PartnerCalendarPage from './PartnerCalendarPage.jsx'
import { DemoProvider } from '../lib/demo.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const family = { id: 30, name: 'Hundeschule Wiesengrund', art: 'partner', partner: { id: 4, name: 'Hundeschule Wiesengrund', typ: 'hundeschule' } }

const welpen = {
  id: 1,
  titel: 'Welpenspielstunde',
  text: null,
  ort: 'Trainingsplatz',
  datum: '2026-10-10',
  uhrzeit: '10:00',
  ende: '11:00',
  serie: 'woechentlich',
  serieBis: '2026-10-24',
  ausgeblendet: false,
  abgelaufen: false,
  absagen: ['2026-10-17']
}
const kurs = { ...welpen, id: 2, titel: 'Erste-Hilfe-Kurs', ort: null, datum: '2026-11-03', uhrzeit: '18:00', ende: null, serie: 'keine', serieBis: null, absagen: [] }
const alt = { ...kurs, id: 3, titel: 'Sommerfest', datum: '2026-08-01', abgelaufen: true }

function vorkommen(termin, datum, overrides = {}) {
  const { id, uhrzeit, ende, titel, text, ort, serie } = termin
  return { terminId: id, datum, uhrzeit, ende, titel, text, ort, serie, abgesagt: false, ausgeblendet: false, ...overrides }
}

function listData(overrides = {}) {
  return {
    max: 50,
    heute: '2026-10-03',
    termine: [welpen, kurs, alt],
    vorkommen: [
      vorkommen(welpen, '2026-10-10'),
      vorkommen(welpen, '2026-10-17', { abgesagt: true }),
      vorkommen(welpen, '2026-10-24'),
      vorkommen(kurs, '2026-11-03')
    ],
    ...overrides
  }
}

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
const nativeSelectValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set

function setInputValue(input, value) {
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function setSelectValue(select, value) {
  nativeSelectValueSetter.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
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
  for (const mock of [termine, createTermin, updateTermin, deleteTermin, absagenTermin, wiederTermin]) mock.mockReset()
})

async function render({ data = listData(), isDemo = false } = {}) {
  termine.mockResolvedValue(data)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <DemoProvider value={isDemo}>
          <PartnerCalendarPage family={family} />
        </DemoProvider>
      </MemoryRouter>
    )
  )
  return container
}

const button = (label) => [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim() === label)
const rows = () => [...container.querySelectorAll('.termin-row')]
const click = (element) => act(async () => element.click())
const submit = () => act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))

describe('PartnerCalendarPage – Übersicht', () => {
  // Audit V7a: jede Serie steht einmal (ihre Tage aufklappbar), Einzeltermine nach Monat darunter.
  test('Serien in einer Zeile mit nächstem Termin und Absagen, Einzeltermine nach Monat, Zähler und Hinweis', async () => {
    await render()
    expect(container.querySelector('h1').textContent).toBe('Kalender')
    expect([...container.querySelectorAll('.termin-month-title')].map((h) => h.textContent)).toEqual(['Serien', 'Einzeltermine'])
    expect(rows()).toHaveLength(2)
    const [serie, einzeln] = rows()
    expect(serie.querySelector('.termin-row-title').textContent).toBe('Welpenspielstunde')
    expect(serie.querySelector('.termin-row-meta').textContent).toBe('Trainingsplatz · Jeden Samstag')
    expect(serie.querySelector('.termin-row-time').textContent).toBe('10:00–11:00 Uhr')
    expect(serie.querySelector('.termin-row-next').textContent).toBe('Nächster Termin: Sa, 10.10. · 1 Tag fällt aus')
    expect(serie.querySelector('.termin-date .visually-hidden').textContent).toBe('Samstag, 10. Oktober')
    // Die Tage der Serie: aufklappbar, der abgesagte durchgestrichen mit "fällt aus".
    expect(serie.querySelector('details summary').textContent).toBe('Einzelne Tage absagen (3)')
    const tage = [...serie.querySelectorAll('.termin-tag')]
    expect(tage.map((tag) => tag.querySelector('.termin-tag-text').textContent)).toEqual(['Sa, 10.10.', 'Sa, 17.10.', 'Sa, 24.10.'])
    expect(tage[1].classList.contains('is-cancelled')).toBe(true)
    expect(tage[1].querySelector('.termin-badge-cancelled').textContent).toBe('fällt aus')
    expect(container.querySelector('.termin-group-label').textContent).toBe('Oktober 2026')

    expect(einzeln.querySelector('.termin-row-title').textContent).toBe('Erste-Hilfe-Kurs')
    expect(einzeln.querySelector('.termin-date .visually-hidden').textContent).toBe('Dienstag, 3. November')
    expect([...einzeln.querySelectorAll('button')].map((btn) => btn.textContent.trim())).toEqual(['Absagen', 'Bearbeiten', 'Löschen'])
    expect(einzeln.querySelector('button').getAttribute('aria-label')).toBe('Diesen Termin absagen: Erste-Hilfe-Kurs am Di, 3.11.')
    expect(container.querySelector('.partner-termine-count').textContent).toBe('3 von 50')
    expect(container.querySelector('.partner-termine-hint').textContent).toMatch(/ohne Prüfung/)
    expect(container.querySelector('.termin-past summary').textContent).toBe('Vergangene Termine (1)')
  })

  test('ohne Serien keine Überschrift "Serien"; fallen alle Tage aus, zählt der erste als nächster', async () => {
    await render({ data: listData({ vorkommen: [vorkommen(kurs, '2026-11-03')] }) })
    expect([...container.querySelectorAll('.termin-month-title')].map((h) => h.textContent)).toEqual(['Einzeltermine'])
    act(() => root.unmount())
    root = null
    await render({ data: listData({ vorkommen: [vorkommen(welpen, '2026-10-10', { abgesagt: true }), vorkommen(welpen, '2026-10-17', { abgesagt: true })] }) })
    expect(rows()[0].querySelector('.termin-row-next').textContent).toBe('Nächster Termin: Sa, 10.10. · 2 Tage fallen aus')
  })

  test('einen Tag absagen und wieder stattfinden lassen - die Antwort ersetzt die Liste', async () => {
    await render()
    const absage = container.querySelector('.termin-tag button')
    expect(absage.textContent).toBe('Absagen')
    expect(absage.getAttribute('aria-label')).toBe('Diesen Termin absagen: Welpenspielstunde am Sa, 10.10.')
    absagenTermin.mockResolvedValue(listData({ vorkommen: [vorkommen(welpen, '2026-10-10', { abgesagt: true })] }))
    await click(absage)
    expect(absagenTermin).toHaveBeenCalledWith(1, '2026-10-10')
    expect(container.querySelectorAll('.termin-tag')).toHaveLength(1)
    expect(container.querySelector('.termin-tag').classList.contains('is-cancelled')).toBe(true)

    wiederTermin.mockResolvedValue(listData())
    await click(button('Wieder stattfinden lassen'))
    expect(wiederTermin).toHaveBeenCalledWith(1, '2026-10-10')
    expect(container.querySelectorAll('.termin-tag')).toHaveLength(3)
  })

  test('eine Serie löschen braucht eine Bestätigung', async () => {
    await render()
    deleteTermin.mockResolvedValue(listData({ termine: [kurs], vorkommen: [vorkommen(kurs, '2026-11-03')] }))
    const remove = rows()[0].querySelector('.btn-danger')
    expect(remove.textContent).toContain('Serie löschen')
    await click(remove)
    expect(deleteTermin).not.toHaveBeenCalled()
    await click(remove)
    expect(deleteTermin).toHaveBeenCalledWith(1)
    expect(rows()).toHaveLength(1)
  })

  test('ohne Termine ein ruhiger Leerzustand', async () => {
    await render({ data: listData({ termine: [], vorkommen: [] }) })
    expect(container.querySelector('.termin-empty').textContent).toBe('Noch keine Termine in den nächsten zwölf Monaten.')
  })

  test('Demo: alles sichtbar, aber gesperrt', async () => {
    await render({ isDemo: true })
    expect(button('Termin anlegen').disabled).toBe(true)
    expect(rows()[0].querySelector('button').disabled).toBe(true)
    expect(container.querySelector('#partner-termine-demo-hint')).not.toBeNull()
  })
})

describe('PartnerCalendarPage – Formular', () => {
  test('neuer Termin als Serie: Regel nach dem Datum, Ende der Serie höchstens ein Jahr', async () => {
    await render()
    await click(button('Termin anlegen'))
    setInputValue(container.querySelector('#termin-titel'), 'Social Walk')
    setInputValue(container.querySelector('#termin-datum'), '2026-10-11')
    setInputValue(container.querySelector('#termin-uhrzeit'), '11:00')
    await act(async () => setSelectValue(container.querySelector('#termin-serie'), 'monatlich_wochentag'))
    const labels = [...container.querySelector('#termin-serie').options].map((option) => option.textContent)
    expect(labels).toContain('Jeden 2. Sonntag im Monat')
    expect(container.querySelector('#termin-serie-bis').getAttribute('max')).toBe('2027-10-11')

    createTermin.mockResolvedValue(listData())
    await submit()
    expect(createTermin).toHaveBeenCalledWith({
      titel: 'Social Walk',
      text: null,
      ort: null,
      datum: '2026-10-11',
      uhrzeit: '11:00',
      ende: null,
      serie: 'monatlich_wochentag',
      serieBis: null
    })
    expect(container.querySelector('form')).toBeNull()
  })

  test('Fehler stehen am Feld - vom Client und vom Server', async () => {
    await render()
    await click(button('Termin anlegen'))
    await submit()
    expect(container.querySelector('#termin-titel-error').textContent).toBe('Der Titel ist Pflicht')
    expect(createTermin).not.toHaveBeenCalled()

    setInputValue(container.querySelector('#termin-titel'), 'Kurs')
    setInputValue(container.querySelector('#termin-datum'), '2026-10-12')
    setInputValue(container.querySelector('#termin-uhrzeit'), '10:00')
    createTermin.mockRejectedValue(new Error('Der Ort darf höchstens 120 Zeichen haben'))
    await submit()
    expect(container.querySelector('#termin-ort-error').textContent).toBe('Der Ort darf höchstens 120 Zeichen haben')
  })

  test('Serie bearbeiten: Hinweis, Werte übernommen, PUT mit der ganzen Serie', async () => {
    await render()
    await click(rows()[0].querySelector('[aria-label="Serie bearbeiten: Welpenspielstunde"]'))
    expect(container.querySelector('form h3').textContent).toBe('Bearbeiten – Welpenspielstunde')
    expect(container.querySelector('form').textContent).toContain('Änderungen gelten für die ganze Serie')
    expect(container.querySelector('#termin-serie-bis').value).toBe('2026-10-24')
    updateTermin.mockResolvedValue(listData())
    await submit()
    expect(updateTermin).toHaveBeenCalledWith(1, expect.objectContaining({ titel: 'Welpenspielstunde', serie: 'woechentlich', serieBis: '2026-10-24' }))
  })
})
