// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { sendAnfrage } = vi.hoisted(() => ({ sendAnfrage: vi.fn() }))
vi.mock('../../api', () => ({ api: { sendAnfrage } }))

import GeschaeftAnfrageForm from './GeschaeftAnfrageForm.jsx'
import { setLang } from '../../lib/i18n/index.js'
import { terminTage } from '../../lib/geschaeftAnfrage.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const setters = {
  INPUT: Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set,
  TEXTAREA: Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set,
  SELECT: Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
}

function type(element, value) {
  act(() => {
    setters[element.tagName].call(element, value)
    element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  })
}

function click(element) {
  act(() => element.click())
}

function setDesktop(matches) {
  window.matchMedia = matches
    ? () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} })
    : undefined
}

beforeEach(async () => {
  localStorage.clear()
  await setLang('de')
  setDesktop(false)
})

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  sendAnfrage.mockReset()
})

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<GeschaeftAnfrageForm />))
  return container
}

const field = (key) => container.querySelector(`#geschaeft-${key}`)
const stepText = () => container.querySelector('.geschaeft-steps-text').textContent

async function submit() {
  await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
}

function fillBetrieb() {
  type(field('firma'), 'Hundeschule Wiesengrund')
  type(field('art'), 'hundeschule')
  type(field('plz'), '10115')
  type(field('ort'), 'Berlin')
}

function fillKontakt() {
  type(field('name'), 'Wilma Beispiel')
  type(field('email'), 'wilma@example.org')
}

describe('GeschaeftAnfrageForm – Schritte am Handy', () => {
  test('drei Schritte: Betrieb → Kontakt → Termine, Weiter prüft nur den aktuellen Schritt', async () => {
    await render()
    expect(stepText()).toBe('Schritt 1 von 3 · Betrieb')
    expect(field('email')).toBeNull()

    await submit()
    expect(stepText()).toBe('Schritt 1 von 3 · Betrieb')
    expect(field('firma-error').textContent).toBe('Bitte gebt den Namen eures Betriebs an.')
    expect(field('ort-error').textContent).toBe('Bitte gebt euren Ort an.')
    expect(document.activeElement).toBe(field('firma'))

    fillBetrieb()
    await submit()
    expect(stepText()).toBe('Schritt 2 von 3 · Kontakt')

    await submit()
    expect(field('email-error').textContent).toBe('Bitte gebt eure E-Mail-Adresse an – nur so können wir euch antworten.')
    type(field('name'), 'Wilma Beispiel')
    type(field('email'), 'keine-adresse')
    await submit()
    expect(field('email-error').textContent).toBe('Bitte gebt eine gültige E-Mail-Adresse an.')

    type(field('email'), 'wilma@example.org')
    await submit()
    expect(stepText()).toBe('Schritt 3 von 3 · Termine')
    click([...container.querySelectorAll('button')].find((b) => b.textContent.includes('Zurück')))
    expect(stepText()).toBe('Schritt 2 von 3 · Kontakt')
    expect(field('email').value).toBe('wilma@example.org')
  })

  test('mindestens ein Terminvorschlag mit Tag und Zeitfenster, höchstens drei, plus Einwilligung', async () => {
    await render()
    fillBetrieb()
    await submit()
    fillKontakt()
    await submit()

    await submit()
    expect(field('termin-0-error').textContent).toBe('Bitte wählt Tag und Zeitfenster.')
    expect(field('einwilligung-error').textContent).toBe('Bitte bestätigt, dass wir euch für diese Anfrage kontaktieren dürfen.')
    expect(sendAnfrage).not.toHaveBeenCalled()

    const plus = () => [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Weiteren Termin vorschlagen'))
    click(plus())
    click(plus())
    expect(container.querySelectorAll('.geschaeft-termin')).toHaveLength(3)
    expect(plus()).toBeUndefined()

    const sundays = [...field('termin-0-datum').options].filter((o) => o.value && new Date(`${o.value}T00:00:00Z`).getUTCDay() === 0)
    expect(sundays).toHaveLength(0)
  })

  test('Absenden: Body mit Geschäftsangaben und Vorschlägen, Honigtopf leer, danach der Dank', async () => {
    sendAnfrage.mockResolvedValue({ ok: true })
    const [tag] = terminTage()
    await render()
    fillBetrieb()
    type(field('webseite'), 'https://wiesengrund.example.org')
    await submit()
    fillKontakt()
    await submit()
    type(field('termin-0-datum'), tag.value)
    type(field('termin-0-zeitfenster'), 'vormittag')
    click(container.querySelector('input[type="radio"][value="video"]'))
    click(field('einwilligung'))
    await submit()

    expect(sendAnfrage).toHaveBeenCalledWith({
      typ: 'partner',
      firma: 'Hundeschule Wiesengrund',
      name: 'Wilma Beispiel',
      email: 'wilma@example.org',
      plz: '10115',
      nachricht: undefined,
      website: '',
      geschaeft: {
        art: 'hundeschule',
        ort: 'Berlin',
        telefon: undefined,
        webseite: 'https://wiesengrund.example.org',
        bundesweit: false,
        einwilligung: true,
        termine: [{ datum: tag.value, zeitfenster: 'vormittag', kanal: 'video' }]
      }
    })
    expect(container.querySelector('[role="status"]').textContent).toBe('Danke! Wir melden uns per E-Mail – meist innerhalb von 2 Werktagen.')
  })

  test('Server-Fehler am Feld führt zurück zum passenden Schritt', async () => {
    sendAnfrage.mockRejectedValue(Object.assign(new Error('Diese Postleitzahl kennen wir nicht'), { status: 400 }))
    await render()
    fillBetrieb()
    await submit()
    fillKontakt()
    await submit()
    type(field('termin-0-datum'), terminTage()[0].value)
    type(field('termin-0-zeitfenster'), 'abend')
    click(field('einwilligung'))
    await submit()
    expect(stepText()).toBe('Schritt 1 von 3 · Betrieb')
    expect(field('plz-error').textContent).toBe('Diese Postleitzahl kennen wir nicht')
  })
})

describe('GeschaeftAnfrageForm – Desktop und Englisch', () => {
  test('Desktop: alle drei Gruppen in einem Formular, ohne Schrittanzeige', async () => {
    setDesktop(true)
    await render()
    expect(container.querySelector('.geschaeft-steps')).toBeNull()
    expect([...container.querySelectorAll('.geschaeft-group-title')].map((h) => h.textContent)).toEqual(['1Betrieb', '2Kontakt', '3Termine'])
    await submit()
    expect(field('firma-error')).not.toBeNull()
    expect(field('email-error')).not.toBeNull()
    expect(field('termin-0-error')).not.toBeNull()
  })

  test('Englisch: Beschriftungen, Schritte und Meldungen übersetzt', async () => {
    await setLang('en')
    await render()
    expect(stepText()).toBe('Step 1 of 3 · Business')
    expect(container.querySelector('label[for="geschaeft-firma"]').textContent).toBe('Business name')
    await submit()
    expect(field('firma-error').textContent).toBe('Please enter the name of your business.')
  })
})
