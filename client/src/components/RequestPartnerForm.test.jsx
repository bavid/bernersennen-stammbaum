// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { sendAnfrage } = vi.hoisted(() => ({ sendAnfrage: vi.fn() }))
vi.mock('../api', () => ({ api: { sendAnfrage } }))

import RequestPartnerForm from './RequestPartnerForm.jsx'

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

function apiError(message, status) {
  return Object.assign(new Error(message), { status })
}

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
  await act(async () => root.render(<RequestPartnerForm />))
  return container
}

const field = (key) => container.querySelector(`#request-partner-${key}`)

async function submit() {
  await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
}

function fillRequired() {
  type(field('firma'), 'Hundeschule Wiesengrund')
  type(field('partnerTyp'), 'hundeschule')
  type(field('email'), 'info@wiesengrund.example.org')
}

describe('RequestPartnerForm – Aufbau', () => {
  test('erklärt oben, warum man anfragt (Wortlaut vom Betreiber)', async () => {
    await render()
    const why = container.querySelector('.request-why')
    expect(why.querySelector('h3').textContent).toBe('Warum anfragen?')
    expect(why.querySelector('p').textContent.replace(/\s+/g, ' ').trim()).toBe(
      'Familie auf Pfoten wächst Schritt für Schritt: Wir sind ein kleines Projekt mit begrenzter Server-Kapazität und ' +
        'richten Partner-Profile deshalb einzeln ein. Erzählt uns kurz, wer ihr seid – wir melden uns mit eurem Partner-Zugang.'
    )
  })

  test('Felder in der Reihenfolge Firma, Art, PLZ, Ansprechperson, E-Mail, Nachricht; Art mit den Partner-Typen', async () => {
    await render()
    const ids = [...container.querySelectorAll('form input:not([name="hp_feld"]), form select, form textarea')].map((el) => el.id)
    expect(ids).toEqual([
      'request-partner-firma',
      'request-partner-partnerTyp',
      'request-partner-plz',
      'request-partner-name',
      'request-partner-email',
      'request-partner-nachricht'
    ])
    const options = [...field('partnerTyp').querySelectorAll('option')].map((option) => option.value)
    expect(options).toEqual(['', 'tierheim', 'vermittlung', 'hundeschule', 'hundesalon', 'betreuung', 'futter', 'sonstige'])
    expect(container.querySelector('#request-partner-hp')).not.toBeNull()
  })
})

describe('RequestPartnerForm – Prüfung', () => {
  test('leer: Fehler an Firma, Art und E-Mail - Fokus auf die Firma', async () => {
    await render()
    await submit()

    expect(sendAnfrage).not.toHaveBeenCalled()
    expect(container.querySelector('#request-partner-firma-error').textContent).toBe(
      'Bitte gebt den Namen eurer Hundeschule, eures Tierheims oder Geschäfts an.'
    )
    expect(container.querySelector('#request-partner-partnerTyp-error').textContent).toBe('Bitte wählt, was für ein Angebot ihr habt.')
    expect(container.querySelector('#request-partner-email-error').textContent).toBe(
      'Bitte gebt eure E-Mail-Adresse an – nur so können wir euch antworten.'
    )
    expect(document.activeElement).toBe(field('firma'))
  })

  test('PLZ mit vier Ziffern: Fehler an der PLZ', async () => {
    await render()
    fillRequired()
    type(field('plz'), '1234')
    await submit()

    expect(sendAnfrage).not.toHaveBeenCalled()
    expect(container.querySelector('#request-partner-plz-error').textContent).toBe('Die Postleitzahl hat fünf Ziffern.')
    expect(document.activeElement).toBe(field('plz'))
  })
})

describe('RequestPartnerForm – Absenden', () => {
  test('Erfolg: schickt typ partner mit Firma, Art, PLZ und Honigtopf, dankt mit "ihr"', async () => {
    sendAnfrage.mockResolvedValue({ ok: true })
    await render()
    fillRequired()
    type(field('plz'), '12345')
    type(field('name'), 'Frau Beispiel')
    type(field('nachricht'), 'Wir bieten Welpenkurse an.')
    await submit()

    expect(sendAnfrage).toHaveBeenCalledWith({
      typ: 'partner',
      name: 'Frau Beispiel',
      email: 'info@wiesengrund.example.org',
      nachricht: 'Wir bieten Welpenkurse an.',
      firma: 'Hundeschule Wiesengrund',
      partnerTyp: 'hundeschule',
      plz: '12345',
      website: ''
    })
    expect(container.querySelector('form')).toBeNull()
    expect(container.querySelector('[role="status"]').textContent).toBe('Danke! Wir melden uns mit eurem Partner-Zugang.')
  })

  test('400 zur PLZ vom Server: Fehler an der PLZ', async () => {
    sendAnfrage.mockRejectedValue(apiError('Diese Postleitzahl kennen wir nicht', 400))
    await render()
    fillRequired()
    type(field('plz'), '00000')
    await submit()

    expect(container.querySelector('#request-partner-plz-error').textContent).toBe('Diese Postleitzahl kennen wir nicht')
    expect(document.activeElement).toBe(field('plz'))
  })

  test('Züchter-Schutz vom Server: Meldung oben im Banner', async () => {
    sendAnfrage.mockRejectedValue(apiError('Züchter und Zucht-Angebote werden hier nicht aufgenommen.', 400))
    await render()
    fillRequired()
    await submit()

    const banner = container.querySelector('.error-banner')
    expect(banner.textContent).toBe('Züchter und Zucht-Angebote werden hier nicht aufgenommen.')
    expect(document.activeElement).toBe(banner)
  })
})
