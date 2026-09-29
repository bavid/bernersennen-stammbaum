// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { anfragen, updateAnfrage, assignAnfrageGutschein, deleteAnfrage, voucherBatches } = vi.hoisted(() => ({
  anfragen: vi.fn(),
  updateAnfrage: vi.fn(),
  assignAnfrageGutschein: vi.fn(),
  deleteAnfrage: vi.fn(),
  voucherBatches: vi.fn()
}))
vi.mock('../api', () => ({ api: { admin: { anfragen, updateAnfrage, assignAnfrageGutschein, deleteAnfrage, voucherBatches } } }))

import AdminAnfragen from './AdminAnfragen.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom implementiert <dialog> nicht vollständig (kein showModal/close) - "Gutschein zuweisen" läuft im Modal.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close() {
    this.open = false
  }
}

const CODE = 'ABCD-EFGH-JKLM'

const gutscheinAnfrage = {
  id: 1,
  typ: 'gutschein',
  name: 'Wilma',
  email: 'wilma@example.org',
  nachricht: 'Wir haben einen Berner und eine Katze.',
  firma: null,
  partnerTyp: null,
  plz: null,
  ort: null,
  status: 'offen',
  notiz: null,
  gutschein: null,
  createdAt: '2026-09-29 08:00:00',
  erledigtAt: null,
  aktualisiertAt: null
}

const partnerAnfrage = {
  ...gutscheinAnfrage,
  id: 2,
  typ: 'partner',
  name: 'Frau Beispiel',
  email: 'info@wiesengrund.example.org',
  nachricht: null,
  firma: 'Hundeschule Wiesengrund',
  partnerTyp: 'hundeschule',
  plz: '12345',
  ort: 'Musterstadt'
}

const erledigteAnfrage = {
  ...gutscheinAnfrage,
  id: 3,
  name: null,
  email: 'lotte@example.org',
  nachricht: null,
  status: 'erledigt',
  gutschein: { id: 40, hint: 'JKLM', status: 'offen' },
  erledigtAt: '2026-09-28 10:00:00'
}

const batches = [
  { id: 10, label: 'Karten Herbst', kind: 'admin', zweck: 'chronik', open: 5, assigned: 2 },
  { id: 11, label: 'Aufgebraucht', kind: 'admin', zweck: 'chronik', open: 2, assigned: 2 },
  { id: 12, label: 'Partnerkarten', kind: 'partner', zweck: 'chronik', open: 9, assigned: 0, partner_name: 'Tierheim Sonnenhang' },
  { id: 13, label: 'Zugänge', kind: 'admin', zweck: 'partnerzugang', partnerTyp: null, open: 3, assigned: 0 }
]

function pageOf(items, extra = {}) {
  return { anfragen: items, gesamt: items.length, seite: 1, seiten: 1, ...extra }
}

let pages
let container
let root
let onCountChange

beforeEach(() => {
  pages = { offen: pageOf([gutscheinAnfrage, partnerAnfrage]), erledigt: pageOf([erledigteAnfrage]), abgelehnt: pageOf([]) }
  anfragen.mockImplementation(({ status } = {}) => Promise.resolve(pages[status]))
  voucherBatches.mockResolvedValue(batches)
  onCountChange = vi.fn()
})

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  for (const mock of [anfragen, updateAnfrage, assignAnfrageGutschein, deleteAnfrage, voucherBatches]) mock.mockReset()
})

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<AdminAnfragen onCountChange={onCountChange} />))
  return container
}

const chips = () => [...container.querySelectorAll('.segmented button')]
const chip = (label) => chips().find((btn) => btn.textContent.startsWith(label))
const rows = () => [...container.querySelectorAll('.admin-anfrage')]
const rowButton = (row, label) => [...row.querySelectorAll('button')].find((btn) => btn.textContent.trim() === label)
const dialog = () => container.querySelector('dialog')

describe('AdminAnfragen – Liste und Filter', () => {
  test('lädt die offenen Anfragen: Zähler am Filter und im Kopf, kompakte Zeilen', async () => {
    await render()

    expect(anfragen).toHaveBeenCalledWith({ status: 'offen', seite: 1 })
    expect(chips().map((btn) => btn.textContent)).toEqual(['Offen (2)', 'Erledigt', 'Abgelehnt'])
    expect(chip('Offen').getAttribute('aria-pressed')).toBe('true')
    expect(onCountChange).toHaveBeenLastCalledWith(2)

    const [first, second] = rows()
    expect(first.querySelector('.admin-anfrage-typ').textContent).toBe('Gutschein')
    expect(first.querySelector('strong').textContent).toBe('Wilma')
    expect(first.querySelector('a.admin-anfrage-email').getAttribute('href')).toBe('mailto:wilma@example.org')
    expect(first.querySelector('time').getAttribute('datetime')).toBe('2026-09-29 08:00:00')
    // Nachricht nach zwei Zeilen eingeklappt (ExpandableText).
    const text = first.querySelector('.admin-anfrage-text')
    expect(text.textContent).toBe('Wir haben einen Berner und eine Katze.')
    expect(text.classList.contains('is-clamped')).toBe(true)
    expect(text.style.getPropertyValue('--clamp-lines')).toBe('2')

    expect(second.querySelector('.admin-anfrage-typ').textContent).toBe('Partner-Zugang')
    expect(second.querySelector('strong').textContent).toBe('Hundeschule Wiesengrund')
    expect(second.querySelector('.admin-anfrage-meta').textContent).toBe('Hundeschule · 12345 Musterstadt · Ansprechperson: Frau Beispiel')
    expect(rowButton(second, 'Partner-Zugang zuweisen')).not.toBeUndefined()
  })

  test('Filter "Erledigt": lädt die erledigten (mit Zähler), "Offen" behält seine Zahl; zugewiesener Gutschein nur als Hinweis', async () => {
    await render()
    await act(async () => chip('Erledigt').click())

    expect(anfragen).toHaveBeenCalledWith({ status: 'erledigt', seite: 1 })
    expect(chips().map((btn) => btn.textContent)).toEqual(['Offen (2)', 'Erledigt (1)', 'Abgelehnt'])
    const [row] = rows()
    expect(row.querySelector('em').textContent).toBe('ohne Namen')
    expect(row.querySelector('.admin-anfrage-gutschein').textContent).toBe('Gutschein …JKLM zugewiesen · Offen')
    expect(rowButton(row, 'Gutschein zuweisen')).toBeUndefined()
    expect(rowButton(row, 'Wieder öffnen')).not.toBeUndefined()

    await act(async () => chip('Abgelehnt').click())
    expect(container.textContent).toContain('Keine abgelehnten Anfragen.')
  })

  test('mehr als 100: "Zurück / Weiter" blättert', async () => {
    pages.offen = pageOf([gutscheinAnfrage], { gesamt: 101, seiten: 2 })
    anfragen.mockImplementation(({ status, seite } = {}) =>
      Promise.resolve(status === 'offen' && seite === 2 ? pageOf([partnerAnfrage], { gesamt: 101, seite: 2, seiten: 2 }) : pages[status])
    )
    await render()

    expect(chip('Offen').textContent).toBe('Offen (101)')
    const pager = container.querySelector('.admin-anfragen-pager')
    expect(pager.textContent).toContain('Seite 1 von 2')
    expect(rowButton(pager, 'Zurück').disabled).toBe(true)

    await act(async () => rowButton(pager, 'Weiter').click())

    expect(anfragen).toHaveBeenLastCalledWith({ status: 'offen', seite: 2 })
    expect(container.querySelector('.admin-anfragen-pager').textContent).toContain('Seite 2 von 2')
    expect(rows()[0].querySelector('strong').textContent).toBe('Hundeschule Wiesengrund')
  })

  test('ein Fehler beim Laden erscheint als Alert', async () => {
    anfragen.mockRejectedValue(new Error('Fehler 401'))
    await render()
    expect(container.querySelector('[role="alert"]').textContent).toBe('Fehler 401')
  })
})

describe('AdminAnfragen – Bearbeiten', () => {
  test('"Erledigt" setzt den Status und lädt neu - die Anfrage verlässt den Filter "Offen"', async () => {
    updateAnfrage.mockResolvedValue({ ...gutscheinAnfrage, status: 'erledigt' })
    await render()

    pages.offen = pageOf([partnerAnfrage])
    await act(async () => rowButton(rows()[0], 'Erledigt').click())

    expect(updateAnfrage).toHaveBeenCalledWith(1, { status: 'erledigt' })
    expect(rows()).toHaveLength(1)
    expect(chip('Offen').textContent).toBe('Offen (1)')
    expect(onCountChange).toHaveBeenLastCalledWith(1)
  })

  test('"Ablehnen" setzt den Status abgelehnt', async () => {
    updateAnfrage.mockResolvedValue({ ...partnerAnfrage, status: 'abgelehnt' })
    await render()
    await act(async () => rowButton(rows()[1], 'Ablehnen').click())
    expect(updateAnfrage).toHaveBeenCalledWith(2, { status: 'abgelehnt' })
  })

  test('Notiz direkt in der Zeile: öffnen, schreiben, speichern', async () => {
    updateAnfrage.mockResolvedValue({ ...gutscheinAnfrage, notiz: 'Code am Montag schicken' })
    await render()

    await act(async () => rowButton(rows()[0], 'Notiz').click())
    const textarea = rows()[0].querySelector('textarea')
    expect(document.activeElement).toBe(textarea)
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, '  Code am Montag schicken ')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    pages.offen = pageOf([{ ...gutscheinAnfrage, notiz: 'Code am Montag schicken' }, partnerAnfrage])
    await act(async () => rows()[0].querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))

    expect(updateAnfrage).toHaveBeenCalledWith(1, { notiz: 'Code am Montag schicken' })
    expect(rows()[0].querySelector('textarea')).toBeNull()
    expect(rows()[0].querySelector('.admin-anfrage-notiz-text').textContent).toBe('Code am Montag schicken')
    expect(rowButton(rows()[0], 'Notiz bearbeiten')).not.toBeUndefined()
  })

  test('"Löschen" fragt nach und löscht dann', async () => {
    deleteAnfrage.mockResolvedValue(null)
    await render()

    await act(async () => rowButton(rows()[0], 'Löschen').click())
    expect(deleteAnfrage).not.toHaveBeenCalled()
    pages.offen = pageOf([partnerAnfrage])
    await act(async () => rowButton(rows()[0], 'Wirklich löschen?').click())

    expect(deleteAnfrage).toHaveBeenCalledWith(1)
    expect(rows()).toHaveLength(1)
  })

  test('ein Fehler beim Ändern steht oben', async () => {
    updateAnfrage.mockRejectedValue(new Error('Diese Anfrage gibt es nicht'))
    await render()
    await act(async () => rowButton(rows()[0], 'Erledigt').click())
    expect(container.querySelector('.error-banner').textContent).toBe('Diese Anfrage gibt es nicht')
  })
})

describe('AdminAnfragen – Gutschein zuweisen', () => {
  let writeText

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
  })

  async function openAssign(index = 0, label = 'Gutschein zuweisen') {
    await act(async () => rowButton(rows()[index], label).click())
  }

  test('bietet nur eigene Stapel mit passendem Zweck und freien Codes an - mit der Zahl der freien', async () => {
    await render()
    await openAssign()

    expect(dialog().open).toBe(true)
    expect(dialog().querySelector('#modal-title').textContent).toBe('Gutschein zuweisen')
    const options = [...dialog().querySelectorAll('#admin-anfrage-batch option')].map((option) => [option.value, option.textContent])
    expect(options).toEqual([['10', 'Karten Herbst · frei: 3']])
  })

  test('Partner-Anfrage: nur Stapel mit Partner-Zugängen', async () => {
    await render()
    await openAssign(1, 'Partner-Zugang zuweisen')

    expect(dialog().querySelector('#modal-title').textContent).toBe('Partner-Zugang zuweisen')
    const options = [...dialog().querySelectorAll('#admin-anfrage-batch option')].map((option) => option.textContent)
    expect(options).toEqual(['Zugänge · frei: 3'])
  })

  test('ohne passenden Stapel: Hinweis statt Auswahl', async () => {
    voucherBatches.mockResolvedValue([batches[1], batches[2]])
    await render()
    await openAssign()

    expect(dialog().querySelector('select')).toBeNull()
    expect(dialog().textContent).toContain('Kein passender Stapel mit freien Codes.')
  })

  test('zeigt den Code einmal mit Kopieren, vorformulierter E-Mail und mailto - nach "Fertig" ist er weg', async () => {
    assignAnfrageGutschein.mockResolvedValue({
      code: CODE,
      anfrage: { ...gutscheinAnfrage, status: 'erledigt', gutschein: { id: 41, hint: 'JKLM', status: 'offen' } }
    })
    await render()
    await openAssign()

    pages.offen = pageOf([partnerAnfrage])
    await act(async () => dialog().querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))

    expect(assignAnfrageGutschein).toHaveBeenCalledWith(1, 10)
    expect(dialog().querySelector('.key-reveal-value').textContent).toBe(CODE)
    expect(document.activeElement.textContent).toBe('Code für wilma@example.org')
    // Die Liste ist schon neu geladen: die Anfrage ist erledigt und verlässt "Offen".
    expect(rows()).toHaveLength(1)

    await act(async () => rowButton(dialog(), 'Code kopieren').click())
    expect(writeText).toHaveBeenCalledWith(CODE)
    expect(rowButton(dialog(), 'Kopiert')).not.toBeUndefined()

    const link = `${window.location.origin}/v#${CODE}`
    expect(dialog().querySelector('#admin-anfrage-mail-subject').value).toBe('Dein Gutschein für Familie auf Pfoten')
    const body = dialog().querySelector('#admin-anfrage-mail-body').value
    expect(body).toContain('Hallo Wilma,')
    expect(body).toContain(`hier ist dein Gutschein für Familie auf Pfoten: ${CODE}`)
    expect(body).toContain(`Einlösen unter ${link}`)

    await act(async () => rowButton(dialog(), 'Text kopieren').click())
    expect(writeText).toHaveBeenLastCalledWith(body)

    const mailto = [...dialog().querySelectorAll('a')].find((a) => a.textContent.includes('Im E-Mail-Programm öffnen')).getAttribute('href')
    expect(mailto.startsWith('mailto:wilma@example.org?subject=Dein%20Gutschein%20f%C3%BCr%20Familie%20auf%20Pfoten&body=')).toBe(true)
    expect(decodeURIComponent(mailto.split('&body=')[1])).toBe(body)

    await act(async () => rowButton(dialog(), 'Fertig').click())

    expect(dialog().open).toBe(false)
    expect(container.innerHTML).not.toContain(CODE)
    expect(container.innerHTML).not.toContain('ABCD')
  })

  test('Schließen über das X verwirft den Code ebenso', async () => {
    assignAnfrageGutschein.mockResolvedValue({ code: CODE, anfrage: { ...gutscheinAnfrage, status: 'erledigt' } })
    await render()
    await openAssign()
    await act(async () => dialog().querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(container.innerHTML).toContain(CODE)

    await act(async () => dialog().querySelector('button[aria-label="Schließen"]').click())
    expect(container.innerHTML).not.toContain(CODE)
  })

  test('ein Fehler der Zuweisung (409) steht im Dialog, die Auswahl bleibt', async () => {
    assignAnfrageGutschein.mockRejectedValue(Object.assign(new Error('In diesem Stapel ist kein freier Gutschein mehr.'), { status: 409 }))
    await render()
    await openAssign()
    await act(async () => dialog().querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))

    expect(dialog().querySelector('[role="alert"]').textContent).toBe('In diesem Stapel ist kein freier Gutschein mehr.')
    expect(dialog().querySelector('#admin-anfrage-batch')).not.toBeNull()
  })
})
