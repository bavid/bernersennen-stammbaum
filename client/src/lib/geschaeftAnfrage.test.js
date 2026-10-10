import { describe, expect, test } from 'vitest'
import { EMPTY_GESCHAEFT, bestaetigungsMail, geschaeftErrorField, geschaeftErrors, terminLabel, terminTage } from './geschaeftAnfrage.js'

// Samstag, 10.10.2026, mittags in Berlin.
const NOW = Date.parse('2026-10-10T10:00:00Z')

const VALID = Object.freeze({
  ...EMPTY_GESCHAEFT,
  firma: 'Tierheim Flocke',
  art: 'tierheim',
  plz: '10115',
  ort: 'Berlin',
  name: 'Benno Beispiel',
  email: 'benno@example.org',
  termine: [{ datum: '2026-10-12', zeitfenster: 'mittag', kanal: '' }],
  einwilligung: true
})

describe('lib/geschaeftAnfrage', () => {
  test('wählbare Tage: ab morgen, 60 Tage, ohne Sonntage', () => {
    const tage = terminTage(NOW)
    expect(tage[0].value).toBe('2026-10-12') // morgen ist Sonntag
    expect(tage.at(-1).value).toBe('2026-12-09')
    expect(tage.some((tag) => new Date(`${tag.value}T00:00:00Z`).getUTCDay() === 0)).toBe(false)
  })

  test('gültig ohne Fehler; Pflichtfelder, https und doppelte Vorschläge werden gemeldet', () => {
    expect(geschaeftErrors(VALID, { now: NOW })).toEqual({})
    const errors = geschaeftErrors(
      { ...VALID, email: '', webseite: 'http://flocke.example.org', termine: [VALID.termine[0], VALID.termine[0]], einwilligung: false },
      { now: NOW }
    )
    expect(Object.keys(errors).sort()).toEqual(['einwilligung', 'email', 'termin-1', 'webseite'])
    expect(geschaeftErrors({ ...VALID, termine: [{ datum: '2026-10-11', zeitfenster: 'mittag', kanal: '' }] }, { now: NOW })).toHaveProperty('termin-0')
    expect(geschaeftErrors({ ...VALID, email: '' }, { now: NOW, stepKey: 'betrieb' })).toEqual({})
  })

  test('Server-Meldung -> Feld', () => {
    expect(geschaeftErrorField({ status: 400, message: 'Die Webseite muss mit https:// beginnen.' })).toBe('webseite')
    expect(geschaeftErrorField({ status: 429, message: 'Die Webseite muss mit https:// beginnen.' })).toBeNull()
  })

  test('Bestätigungstext mit dem gewählten Termin, Kanal und Notiz', () => {
    const anfrage = {
      name: 'Benno Beispiel',
      geschaeft: {
        termine: [{ datum: '2026-10-13', zeitfenster: 'vormittag', kanal: 'telefon' }],
        bestaetigt: { index: 0, notiz: 'Wir freuen uns!' }
      }
    }
    const mail = bestaetigungsMail({ anfrage, appName: 'Familie auf Pfoten' })
    expect(mail.subject).toBe('Euer Termin mit Familie auf Pfoten')
    expect(mail.body).toContain('Hallo Benno Beispiel,')
    expect(mail.body).toContain('Dienstag, 13.10.2026 · Vormittag (9–12 Uhr) · Telefon')
    expect(mail.body).toContain('Wir rufen euch an.')
    expect(mail.body).toContain('Wir freuen uns!')
    expect(bestaetigungsMail({ anfrage: { geschaeft: { ...anfrage.geschaeft, bestaetigt: null } }, appName: 'X' })).toBeNull()
    expect(terminLabel({ datum: '2026-10-17', zeitfenster: 'abend' })).toBe('Samstag, 17.10.2026 · Abend (18–20 Uhr)')
  })
})
