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
  test('allein kontaktformular: true vom Server gibt das Formular frei', () => {
    expect(contactFormState({ kontaktformular: true })).toBe('available')
    expect(showContactForm({ kontaktformular: true })).toBe(true)
  })

  test('Demo-Partner: kontaktformular false plus kontaktformularDemo - Knopf sichtbar (gesperrt)', () => {
    expect(contactFormState({ kontaktformular: false, kontaktformularDemo: true })).toBe('demo')
    expect(showContactForm({ kontaktformular: false, kontaktformularDemo: true })).toBe(true)
  })

  test('false, fehlend oder nur die alten Felder kontaktformularAktiv/kontaktformular_aktiv: kein Formular', () => {
    expect(contactFormState({ kontaktformular: false })).toBe('unavailable')
    expect(contactFormState({ name: 'Hundeschule Wiesengrund' })).toBe('unavailable')
    expect(contactFormState({ kontaktformularAktiv: true, kontaktformular_aktiv: 1 })).toBe('unavailable')
    expect(contactFormState({ kontaktformular: 'true' })).toBe('unavailable')
    expect(contactFormState(null)).toBe('unavailable')
    expect(showContactForm({})).toBe(false)
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
