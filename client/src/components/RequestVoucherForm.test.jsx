// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { sendAnfrage } = vi.hoisted(() => ({ sendAnfrage: vi.fn() }))
vi.mock('../api', () => ({ api: { sendAnfrage } }))

import RequestVoucherForm from './RequestVoucherForm.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set

function type(element, value) {
  const setter = element.tagName === 'TEXTAREA' ? nativeTextareaValueSetter : nativeInputValueSetter
  act(() => {
    setter.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
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

async function render(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<RequestVoucherForm {...props} />))
  return container
}

const field = (key) => container.querySelector(`#request-voucher-${key}`)

async function submit() {
  await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
}

describe('RequestVoucherForm – Aufbau', () => {
  test('erklärt oben, warum es Gutscheine gibt (Wortlaut vom Betreiber)', async () => {
    await render()
    const why = container.querySelector('.request-why')
    expect(why.querySelector('h3').textContent).toBe('Warum per Gutschein?')
    expect(why.querySelector('p').textContent.replace(/\s+/g, ' ').trim()).toBe(
      'Familie auf Pfoten ist ein kleines, privat betriebenes Projekt: ohne Tracking, ohne Datenhandel und mit einem bewusst ' +
        'kleinen eigenen Server. Damit alles schnell und zuverlässig bleibt, nehmen wir neue Familien nach und nach auf. ' +
        'Schreib uns kurz – wir schicken dir deinen persönlichen Code, sobald wieder Platz ist.'
    )
    // Die Erklärung steht über den Feldern.
    expect(why.compareDocumentPosition(field('name')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  test('Felder: Name freiwillig, E-Mail Pflicht (type email), Nachricht mit Zähler bis 1000', async () => {
    await render()
    expect(container.querySelector('label[for="request-voucher-name"]').textContent).toBe('Dein Name (freiwillig)')
    expect(field('email').getAttribute('type')).toBe('email')
    expect(field('email').required).toBe(true)
    expect(field('nachricht').getAttribute('maxlength')).toBe('1000')

    type(field('nachricht'), 'Hallo')
    expect(container.querySelector('#request-voucher-nachricht-hint').textContent).toBe('5 / 1000 Zeichen')
  })

  test('Honigtopf: versteckt, nicht per Tab erreichbar, eigene id', async () => {
    await render({ idPrefix: 'login-request' })
    const honeypot = container.querySelector('#login-request-hp')
    expect(honeypot.closest('.honeypot').getAttribute('aria-hidden')).toBe('true')
    expect(honeypot.getAttribute('tabindex')).toBe('-1')
  })
})

describe('RequestVoucherForm – Prüfung', () => {
  test('ohne E-Mail: Fehler am Feld, Fokus dorthin, nichts wird geschickt', async () => {
    await render()
    await submit()

    expect(sendAnfrage).not.toHaveBeenCalled()
    expect(field('email').getAttribute('aria-invalid')).toBe('true')
    expect(container.querySelector('#request-voucher-email-error').textContent).toBe(
      'Bitte gib deine E-Mail-Adresse an – nur so können wir dir antworten.'
    )
    expect(document.activeElement).toBe(field('email'))

    // Tippen nimmt den Fehler weg.
    type(field('email'), 'wilma@')
    expect(container.querySelector('#request-voucher-email-error')).toBeNull()
  })

  test('E-Mail im falschen Format: eigener Satz', async () => {
    await render()
    type(field('email'), 'wilma@beispiel')
    await submit()

    expect(sendAnfrage).not.toHaveBeenCalled()
    expect(container.querySelector('#request-voucher-email-error').textContent).toBe('Bitte gib eine gültige E-Mail-Adresse an.')
  })
})

describe('RequestVoucherForm – Absenden', () => {
  test('Erfolg: schickt typ gutschein samt Honigtopf, klappt zu und dankt - Fokus auf den Dank', async () => {
    sendAnfrage.mockResolvedValue({ ok: true })
    await render()
    type(field('name'), '  Wilma ')
    type(field('email'), 'wilma@example.org')
    type(field('nachricht'), 'Wir haben einen Berner und eine Katze.')
    await submit()

    expect(sendAnfrage).toHaveBeenCalledWith({
      typ: 'gutschein',
      name: 'Wilma',
      email: 'wilma@example.org',
      nachricht: 'Wir haben einen Berner und eine Katze.',
      website: ''
    })
    expect(container.querySelector('form')).toBeNull()
    const success = container.querySelector('[role="status"]')
    expect(success.textContent).toBe('Danke! Wir melden uns per E-Mail, sobald wieder Platz ist.')
    expect(document.activeElement).toBe(success)
  })

  test('der ausgefüllte Honigtopf geht mit (der Server lehnt ab), die Meldung steht oben', async () => {
    sendAnfrage.mockRejectedValue(apiError('Anfrage abgelehnt', 400))
    await render()
    type(field('email'), 'wilma@example.org')
    type(container.querySelector('#request-voucher-hp'), 'https://spam.example.org')
    await submit()

    expect(sendAnfrage.mock.calls[0][0].website).toBe('https://spam.example.org')
    const banner = container.querySelector('.error-banner')
    expect(banner.textContent).toBe('Anfrage abgelehnt')
    expect(document.activeElement).toBe(banner)
  })

  test('400 "gibt es nicht" vom Server: Fehler an der E-Mail, Fokus dorthin, Eingaben bleiben', async () => {
    sendAnfrage.mockRejectedValue(apiError('Diese E-Mail-Adresse scheint es nicht zu geben.', 400))
    await render()
    type(field('email'), 'wilma@gibtsnicht.example')
    await submit()

    expect(container.querySelector('#request-voucher-email-error').textContent).toBe('Diese E-Mail-Adresse scheint es nicht zu geben.')
    expect(document.activeElement).toBe(field('email'))
    expect(field('email').value).toBe('wilma@gibtsnicht.example')
  })

  test('429: eigener Satz im Banner', async () => {
    sendAnfrage.mockRejectedValue(apiError('Fehler 429', 429))
    await render()
    type(field('email'), 'wilma@example.org')
    await submit()

    expect(container.querySelector('.error-banner').textContent).toBe('Zu viele Anfragen in kurzer Zeit – bitte später noch einmal versuchen.')
  })
})
