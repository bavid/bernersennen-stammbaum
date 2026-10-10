// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { hinweise, createHinweis, updateHinweis, deleteHinweis } = vi.hoisted(() => ({
  hinweise: vi.fn(),
  createHinweis: vi.fn(),
  updateHinweis: vi.fn(),
  deleteHinweis: vi.fn()
}))
vi.mock('../api', () => ({ api: { admin: { hinweise, createHinweis, updateHinweis, deleteHinweis } } }))

import AdminHinweise from './AdminHinweise.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const AKTIV = {
  id: 4,
  titel: 'Wartung heute Abend',
  text: 'Ab 22 Uhr kurz weg.',
  stufe: 'wartung',
  start: '2026-10-05T20:00:00.000Z',
  ende: '2026-10-05T23:30:00.000Z',
  aktiv: true,
  isDemo: false,
  status: 'aktiv'
}
const GEPLANT = { ...AKTIV, id: 3, titel: 'Neu: Kalender', text: null, stufe: 'info', ende: null, status: 'geplant' }
const ABGELAUFEN = { ...AKTIV, id: 2, titel: 'Alter Hinweis', status: 'abgelaufen' }
const AUS = { ...AKTIV, id: 1, titel: 'Willkommen auf der Vorschau', aktiv: false, isDemo: true, status: 'aus' }

let container
let root

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
const nativeSelectValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set

function type(element, value) {
  const setter = element instanceof HTMLTextAreaElement ? nativeTextareaValueSetter : nativeInputValueSetter
  act(() => {
    setter.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function choose(select, value) {
  act(() => {
    nativeSelectValueSetter.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
  for (const mock of [hinweise, createHinweis, updateHinweis, deleteHinweis]) mock.mockReset()
})

async function render(list = [GEPLANT, AKTIV, ABGELAUFEN, AUS]) {
  hinweise.mockResolvedValue({ hinweise: list, max: 100 })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<AdminHinweise />))
}

const button = (label, scope = container) =>
  [...scope.querySelectorAll('button')].find((btn) => btn.textContent.trim() === label || btn.getAttribute('aria-label') === label)
const rows = () => [...container.querySelectorAll('.admin-hinweis')]
const field = (id) => container.querySelector(`#${id}`)
const submit = () => act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
const preview = () => container.querySelector('[aria-label="Vorschau des Hinweis-Bands"]')

describe('AdminHinweise – Liste', () => {
  test('Status-Chips, Zeitraum in Berliner Zeit, Beispiel-Kennzeichen', async () => {
    await render()
    expect(container.querySelector('h2').textContent).toBe('Hinweise')
    expect(rows().map((row) => row.querySelector('.admin-hinweis-status').textContent)).toEqual(['Geplant', 'Aktiv', 'Abgelaufen', 'Aus'])
    expect(rows()[1].textContent).toContain('5. Oktober 2026, 22:00 Uhr – 6. Oktober 2026, 01:30 Uhr')
    expect(rows()[0].textContent).toContain('ohne Ende')
    expect(rows()[3].textContent).toContain('Beispiel')
    expect(rows()[1].querySelector('.admin-hinweis-stufe').textContent).toBe('Wartung')
  })

  test('leer: ein ruhiger Hinweis statt einer leeren Liste', async () => {
    await render([])
    expect(container.textContent).toContain('Noch keine Hinweise')
  })

  test('Fehler beim Laden steht oben', async () => {
    hinweise.mockRejectedValue(new Error('Nur für Admins'))
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(<AdminHinweise />))
    expect(container.querySelector('[role="alert"]').textContent).toBe('Nur für Admins')
  })
})

describe('AdminHinweise – anlegen mit Vorschau', () => {
  test('Vorschau folgt den Eingaben; Speichern schickt Zeiten in UTC und lädt neu', async () => {
    await render([])
    await act(async () => button('Neuer Hinweis').click())
    expect(preview()).not.toBeNull()
    expect(preview().classList.contains('hinweis-info')).toBe(true)

    type(field('admin-hinweis-titel'), 'Wartung am Montag')
    type(field('admin-hinweis-text'), 'Zeile 1\nZeile 2')
    choose(field('admin-hinweis-stufe'), 'wartung')
    expect(preview().querySelector('.hinweis-titel-text').textContent).toBe('Wartung am Montag')
    expect(preview().classList.contains('hinweis-wartung')).toBe(true)

    type(field('admin-hinweis-start-datum'), '2026-10-05')
    type(field('admin-hinweis-start-zeit'), '22:00')
    type(field('admin-hinweis-ende-datum'), '2026-10-06')
    type(field('admin-hinweis-ende-zeit'), '01:30')
    createHinweis.mockResolvedValue({ ...AKTIV, id: 9 })
    hinweise.mockResolvedValue({ hinweise: [{ ...AKTIV, id: 9 }], max: 100 })
    await submit()

    expect(createHinweis).toHaveBeenCalledWith({
      titel: 'Wartung am Montag',
      text: 'Zeile 1\nZeile 2',
      titelEn: null,
      textEn: null,
      stufe: 'wartung',
      start: '2026-10-05T20:00:00.000Z',
      ende: '2026-10-05T23:30:00.000Z',
      aktiv: true
    })
    expect(hinweise).toHaveBeenCalledTimes(2)
    expect(container.querySelector('form')).toBeNull()
    expect(rows()).toHaveLength(1)
  })

  test('ohne Titel: Fehler am Feld, keine Anfrage', async () => {
    await render([])
    await act(async () => button('Neuer Hinweis').click())
    await submit()
    expect(createHinweis).not.toHaveBeenCalled()
    expect(field('admin-hinweis-titel').getAttribute('aria-invalid')).toBe('true')
    expect(container.textContent).toContain('Bitte gib einen Titel an.')
  })

  test('Fehler vom Server landen am genannten Feld', async () => {
    await render([])
    await act(async () => button('Neuer Hinweis').click())
    type(field('admin-hinweis-titel'), 'T')
    createHinweis.mockRejectedValue(Object.assign(new Error('Das Ende muss nach dem Beginn liegen.'), { status: 400, details: { feld: 'ende' } }))
    await submit()
    expect(field('admin-hinweis-ende-datum').getAttribute('aria-invalid')).toBe('true')
    expect(container.textContent).toContain('Das Ende muss nach dem Beginn liegen.')
  })

  test('Abbrechen schließt das Formular; der Fokus springt ins Titelfeld und danach zurück zum Knopf', async () => {
    // Wie im Browser: der nächste Frame kommt erst nach dem Rendern (dann ist der Knopf wieder frei).
    const frames = []
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => frames.push(callback))
    const nextFrame = () => act(() => frames.splice(0).forEach((callback) => callback()))
    await render([AKTIV])
    await act(async () => button('Neuer Hinweis').click())
    expect(document.activeElement).toBe(field('admin-hinweis-titel'))
    await act(async () => button('Abbrechen').click())
    nextFrame()
    expect(container.querySelector('form')).toBeNull()
    expect(document.activeElement).toBe(button('Neuer Hinweis'))

    await act(async () => button('Bearbeiten').click())
    await act(async () => button('Abbrechen').click())
    nextFrame()
    expect(document.activeElement).toBe(button('Bearbeiten'))
    raf.mockRestore()
  })
})

describe('AdminHinweise – bearbeiten, umschalten, löschen', () => {
  test('Bearbeiten: Werte in Berliner Zeit, PUT mit allen Feldern', async () => {
    await render([AKTIV])
    await act(async () => button('Bearbeiten').click())
    expect(field('admin-hinweis-start-zeit').value).toBe('22:00')
    expect(field('admin-hinweis-ende-datum').value).toBe('2026-10-06')
    type(field('admin-hinweis-ende-zeit'), '02:00')
    updateHinweis.mockResolvedValue(AKTIV)
    await submit()
    expect(updateHinweis).toHaveBeenCalledWith(4, {
      titel: 'Wartung heute Abend',
      text: 'Ab 22 Uhr kurz weg.',
      titelEn: null,
      textEn: null,
      stufe: 'wartung',
      start: '2026-10-05T20:00:00.000Z',
      ende: '2026-10-06T00:00:00.000Z',
      aktiv: true
    })
  })

  test('Ausschalten und Einschalten schicken nur aktiv', async () => {
    await render([AKTIV, AUS])
    updateHinweis.mockResolvedValue({ ...AKTIV, aktiv: false, status: 'aus' })
    await act(async () => button('Ausschalten', rows()[0]).click())
    expect(updateHinweis).toHaveBeenCalledWith(4, { aktiv: false })
    await act(async () => button('Einschalten', rows()[1]).click())
    expect(updateHinweis).toHaveBeenCalledWith(1, { aktiv: true })
  })

  test('Löschen erst nach Bestätigung', async () => {
    await render([AKTIV])
    deleteHinweis.mockResolvedValue(null)
    await act(async () => button('Löschen').click())
    expect(deleteHinweis).not.toHaveBeenCalled()
    await act(async () => button('Wirklich löschen?').click())
    expect(deleteHinweis).toHaveBeenCalledWith(4)
  })

  test('voll: „Neuer Hinweis“ gesperrt, mit Begründung', async () => {
    hinweise.mockResolvedValue({ hinweise: [AKTIV], max: 1 })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(<AdminHinweise />))
    expect(button('Neuer Hinweis').disabled).toBe(true)
    expect(container.textContent).toContain('Höchstens 1 Hinweise')
  })
})
