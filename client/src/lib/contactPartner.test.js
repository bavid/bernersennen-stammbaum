import { describe, expect, test } from 'vitest'
import {
  EMPTY_CONTACT_FORM,
  NACHRICHT_LENGTH_MESSAGE,
  RATE_LIMIT_MESSAGE,
  REACHABLE_MESSAGE,
  UNAVAILABLE_MESSAGE,
  contactClientErrors,
  contactErrorField,
  contactErrorMessage,
  contactFormState,
  showContactForm,
  toContactPayload
} from './contactPartner.js'

function apiError(message, status) {
  return Object.assign(new Error(message), { status })
}

describe('contactFormState / showContactForm', () => {
  test('kontaktformular: true/false vom Server entscheidet', () => {
    expect(contactFormState({ kontaktformular: true })).toBe('available')
    expect(contactFormState({ kontaktformular: false })).toBe('unavailable')
  })

  test('kontaktformularAktiv / kontaktformular_aktiv als Rückfall', () => {
    expect(contactFormState({ kontaktformularAktiv: true })).toBe('available')
    expect(contactFormState({ kontaktformular_aktiv: 1 })).toBe('available')
    expect(contactFormState({ kontaktformular_aktiv: 0 })).toBe('unavailable')
  })

  test('ohne Angabe: unbekannt - öffentlich kein Knopf, in der Kundensicht (deaktiviert) schon', () => {
    expect(contactFormState({ name: 'Hundeschule Wiesengrund' })).toBe('unknown')
    expect(contactFormState(null)).toBe('unknown')
    expect(showContactForm({})).toBe(false)
    expect(showContactForm({}, { preview: true })).toBe(true)
    expect(showContactForm({ kontaktformular: false }, { preview: true })).toBe(false)
    expect(showContactForm({ kontaktformular: true })).toBe(true)
  })
})

describe('contactClientErrors', () => {
  const valid = { ...EMPTY_CONTACT_FORM, email: 'wilma@example.org', nachricht: 'Habt ihr noch Plätze im Welpenkurs?' }

  test('ein gültiges Formular hat keine Fehler (Name freiwillig, Telefon statt E-Mail reicht)', () => {
    expect(contactClientErrors(valid)).toEqual({})
    expect(contactClientErrors({ ...valid, email: '', telefon: '0171 234567' })).toEqual({})
  })

  test('E-Mail oder Telefon ist Pflicht', () => {
    expect(contactClientErrors({ ...valid, email: ' ', telefon: '' }).email).toBe(REACHABLE_MESSAGE)
  })

  test('Nachricht 10-2000 Zeichen, getrimmt gezählt', () => {
    expect(contactClientErrors({ ...valid, nachricht: '  kurz   ' }).nachricht).toBe(NACHRICHT_LENGTH_MESSAGE)
    expect(contactClientErrors({ ...valid, nachricht: 'x'.repeat(2001) }).nachricht).toBe(NACHRICHT_LENGTH_MESSAGE)
    expect(contactClientErrors({ ...valid, nachricht: 'x'.repeat(10) })).toEqual({})
  })

  test('Name höchstens 80 Zeichen, kein HTML', () => {
    expect(contactClientErrors({ ...valid, name: 'x'.repeat(81) }).name).toMatch(/höchstens 80/)
    expect(contactClientErrors({ ...valid, nachricht: 'Hallo <b>ihr</b> Lieben!' }).nachricht).toMatch(/kein HTML/)
  })
})

describe('toContactPayload', () => {
  test('trimmt und lässt leere Felder weg', () => {
    expect(toContactPayload({ name: ' ', email: ' wilma@example.org ', telefon: '', nachricht: ' Hallo zusammen! ' })).toEqual({
      name: undefined,
      email: 'wilma@example.org',
      telefon: undefined,
      nachricht: 'Hallo zusammen!'
    })
  })
})

describe('contactErrorField / contactErrorMessage', () => {
  test('400-Meldungen landen am Feld', () => {
    expect(contactErrorField(apiError('Die E-Mail-Adresse ist ungültig', 400))).toBe('email')
    expect(contactErrorField(apiError('Die Telefonnummer ist ungültig', 400))).toBe('telefon')
    expect(contactErrorField(apiError('Die Nachricht muss 10 bis 2000 Zeichen haben.', 400))).toBe('nachricht')
    expect(contactErrorField(apiError('Anfrage abgelehnt', 400))).toBeNull()
    expect(contactErrorField(apiError('Die Nachricht muss 10 bis 2000 Zeichen haben.', 500))).toBeNull()
  })

  test('429 und 404 mit eigenem Satz, sonst die Meldung des Servers', () => {
    expect(contactErrorMessage(apiError('Zu viele Nachrichten in kurzer Zeit', 429))).toBe(RATE_LIMIT_MESSAGE)
    expect(contactErrorMessage(apiError('Diesen Partner gibt es nicht', 404))).toBe(UNAVAILABLE_MESSAGE)
    expect(contactErrorMessage(apiError('In der Demo werden keine Nachrichten verschickt.', 403))).toBe(
      'In der Demo werden keine Nachrichten verschickt.'
    )
  })
})
