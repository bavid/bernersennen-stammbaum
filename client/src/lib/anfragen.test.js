import { describe, expect, test } from 'vitest'
import {
  EMPTY_PARTNER_REQUEST,
  EMPTY_VOUCHER_REQUEST,
  FIRMA_MISSING_MESSAGE,
  PARTNER_TYP_MISSING_MESSAGE,
  PLZ_MESSAGE,
  RATE_LIMIT_MESSAGE,
  assignableBatches,
  assignmentMail,
  canAssign,
  freeCodes,
  mailtoHref,
  requestClientErrors,
  requestErrorField,
  requestErrorMessage,
  toRequestPayload
} from './anfragen.js'

function apiError(message, status) {
  return Object.assign(new Error(message), { status })
}

describe('requestClientErrors – Gutschein-Anfrage ("du")', () => {
  test('ohne E-Mail: Pflichtfeld mit Du-Anrede', () => {
    expect(requestClientErrors(EMPTY_VOUCHER_REQUEST, 'gutschein')).toEqual({
      email: 'Bitte gib deine E-Mail-Adresse an – nur so können wir dir antworten.'
    })
  })

  test.each(['wilma', 'wilma@beispiel', 'wil ma@example.org', 'a@b.org?cc=x', 'a<b@example.org', `${'a'.repeat(115)}@example.org`])(
    'ungültige E-Mail "%s"',
    (email) => {
      expect(requestClientErrors({ ...EMPTY_VOUCHER_REQUEST, email }, 'gutschein').email).toBe('Bitte gib eine gültige E-Mail-Adresse an.')
    }
  )

  test('gültig: keine Fehler; Name und Nachricht werden auf Länge und HTML geprüft', () => {
    const form = { name: 'Wilma', email: ' wilma@example.org ', nachricht: 'Wir haben zwei Hunde.' }
    expect(requestClientErrors(form, 'gutschein')).toEqual({})
    expect(requestClientErrors({ ...form, name: 'x'.repeat(81) }, 'gutschein').name).toBe('Der Name darf höchstens 80 Zeichen haben.')
    expect(requestClientErrors({ ...form, nachricht: '<b>hallo</b>' }, 'gutschein').nachricht).toBe('Bitte nur reinen Text eingeben (kein HTML).')
    expect(requestClientErrors({ ...form, nachricht: 'x'.repeat(1001) }, 'gutschein').nachricht).toBe(
      'Die Nachricht darf höchstens 1000 Zeichen haben.'
    )
  })
})

describe('requestClientErrors – Partner-Anfrage ("ihr")', () => {
  test('Firma, Art und E-Mail sind Pflicht - in der Reihenfolge der Felder', () => {
    const errors = requestClientErrors(EMPTY_PARTNER_REQUEST, 'partner')
    expect(Object.keys(errors)).toEqual(['firma', 'partnerTyp', 'email'])
    expect(errors.firma).toBe(FIRMA_MISSING_MESSAGE)
    expect(errors.partnerTyp).toBe(PARTNER_TYP_MISSING_MESSAGE)
    expect(errors.email).toBe('Bitte gebt eure E-Mail-Adresse an – nur so können wir euch antworten.')
  })

  test('PLZ freiwillig, wenn angegeben genau fünf Ziffern', () => {
    const form = { ...EMPTY_PARTNER_REQUEST, firma: 'Hundeschule Wiesengrund', partnerTyp: 'hundeschule', email: 'info@example.org' }
    expect(requestClientErrors(form, 'partner')).toEqual({})
    expect(requestClientErrors({ ...form, plz: '12345' }, 'partner')).toEqual({})
    expect(requestClientErrors({ ...form, plz: '1234' }, 'partner').plz).toBe(PLZ_MESSAGE)
    expect(requestClientErrors({ ...form, plz: '1234a' }, 'partner').plz).toBe(PLZ_MESSAGE)
  })
})

describe('toRequestPayload', () => {
  test('Gutschein: getrimmt, leere freiwillige Felder fallen weg, keine Partner-Felder', () => {
    expect(toRequestPayload({ name: '  ', email: ' wilma@example.org ', nachricht: ' Hallo ' }, 'gutschein')).toEqual({
      typ: 'gutschein',
      name: undefined,
      email: 'wilma@example.org',
      nachricht: 'Hallo'
    })
  })

  test('Partner: mit Firma, Art und PLZ', () => {
    const form = { firma: ' Hundeschule Wiesengrund ', partnerTyp: 'hundeschule', plz: '', name: 'Frau Beispiel', email: 'info@example.org', nachricht: '' }
    expect(toRequestPayload(form, 'partner')).toEqual({
      typ: 'partner',
      name: 'Frau Beispiel',
      email: 'info@example.org',
      nachricht: undefined,
      firma: 'Hundeschule Wiesengrund',
      partnerTyp: 'hundeschule',
      plz: undefined
    })
  })
})

describe('requestErrorField / requestErrorMessage', () => {
  const partnerFields = Object.keys(EMPTY_PARTNER_REQUEST)
  const voucherFields = Object.keys(EMPTY_VOUCHER_REQUEST)

  test.each([
    ['Diese E-Mail-Adresse scheint es nicht zu geben.', 'email'],
    ['Die E-Mail-Adresse ist ungültig', 'email'],
    ['Der Name darf höchstens 80 Zeichen haben.', 'name'],
    ['Der Name darf höchstens 120 Zeichen haben.', 'firma'],
    ['Bitte gebt den Namen eurer Hundeschule, eures Tierheims oder Geschäfts an.', 'firma'],
    ['Bitte wählt aus der Liste, was für ein Angebot ihr habt.', 'partnerTyp'],
    ['Diese Postleitzahl kennen wir nicht', 'plz'],
    ['Die Nachricht darf höchstens 1000 Zeichen haben.', 'nachricht']
  ])('400 "%s" -> %s', (message, field) => {
    expect(requestErrorField(apiError(message, 400), partnerFields)).toBe(field)
  })

  test('nur Felder, die das Formular hat; nur bei 400', () => {
    expect(requestErrorField(apiError('Diese Postleitzahl kennen wir nicht', 400), voucherFields)).toBeNull()
    expect(requestErrorField(apiError('Züchter und Zucht-Angebote werden hier nicht aufgenommen.', 400), partnerFields)).toBeNull()
    expect(requestErrorField(apiError('Diese E-Mail-Adresse scheint es nicht zu geben.', 500), voucherFields)).toBeNull()
  })

  test('429 mit eigenem Satz, sonst die Server-Meldung', () => {
    expect(requestErrorMessage(apiError('Fehler 429', 429))).toBe(RATE_LIMIT_MESSAGE)
    expect(requestErrorMessage(apiError('Anfrage abgelehnt', 400))).toBe('Anfrage abgelehnt')
  })
})

describe('Admin: Stapel für die Zuweisung', () => {
  const batches = [
    { id: 1, label: 'Karten Herbst', kind: 'admin', zweck: 'chronik', open: 5, assigned: 2 },
    { id: 2, label: 'Alt ohne Zweck', kind: 'admin', open: 1, assigned: 0 },
    { id: 3, label: 'Leer', kind: 'admin', zweck: 'chronik', open: 3, assigned: 3 },
    { id: 4, label: 'Partnerkarten', kind: 'partner', zweck: 'chronik', open: 9, assigned: 0, partner_name: 'Tierheim Sonnenhang' },
    { id: 5, label: 'Weitergabe', kind: 'rudel', zweck: 'chronik', open: 2, assigned: 0 },
    { id: 6, label: 'Zugänge', kind: 'admin', zweck: 'partnerzugang', partnerTyp: null, open: 4, assigned: 1 },
    { id: 7, label: 'Zugänge Salons', kind: 'admin', zweck: 'partnerzugang', partnerTyp: 'hundesalon', open: 2, assigned: 0 },
    { id: 8, label: 'Zugang Wiesengrund', kind: 'admin', zweck: 'partnerzugang', open: 1, assigned: 0, partner_name: 'Hundeschule Wiesengrund' }
  ]

  test('freeCodes: offen minus zugewiesen, nie negativ', () => {
    expect(freeCodes(batches[0])).toBe(3)
    expect(freeCodes({ open: 1 })).toBe(1)
    expect(freeCodes({ open: 1, assigned: 4 })).toBe(0)
  })

  test('Gutschein-Anfrage: nur eigene Admin-Stapel mit Kunden-Gutscheinen und freien Codes', () => {
    expect(assignableBatches(batches, { typ: 'gutschein' }).map((batch) => batch.id)).toEqual([1, 2])
  })

  test('Partner-Anfrage: Partner-Zugänge, passende Typ-Vorgabe, keine gebundenen', () => {
    expect(assignableBatches(batches, { typ: 'partner', partnerTyp: 'hundeschule' }).map((batch) => batch.id)).toEqual([6])
    expect(assignableBatches(batches, { typ: 'partner', partnerTyp: 'hundesalon' }).map((batch) => batch.id)).toEqual([6, 7])
  })

  test('canAssign: nicht abgelehnt und kein offener/eingelöster Gutschein', () => {
    expect(canAssign({ status: 'offen', gutschein: null })).toBe(true)
    expect(canAssign({ status: 'abgelehnt', gutschein: null })).toBe(false)
    expect(canAssign({ status: 'erledigt', gutschein: { status: 'offen' } })).toBe(false)
    expect(canAssign({ status: 'erledigt', gutschein: { status: 'eingelöst' } })).toBe(false)
    expect(canAssign({ status: 'erledigt', gutschein: { status: 'widerrufen' } })).toBe(true)
  })
})

describe('Admin: vorformulierte E-Mail', () => {
  const link = 'https://chronik.example.org/v#ABCD-EFGH-JKLM'

  test('Gutschein: Du-Anrede, Code und Einlöse-Link', () => {
    const mail = assignmentMail({ anfrage: { typ: 'gutschein', name: 'Wilma' }, code: 'ABCD-EFGH-JKLM', link, appName: 'Familie auf Pfoten' })
    expect(mail.subject).toBe('Dein Gutschein für Familie auf Pfoten')
    expect(mail.body).toContain('Hallo Wilma,')
    expect(mail.body).toContain('hier ist dein Gutschein für Familie auf Pfoten: ABCD-EFGH-JKLM')
    expect(mail.body).toContain(`Einlösen unter ${link}`)
  })

  test('Partner: Ihr-Anrede, ohne Namen "Hallo zusammen,"', () => {
    const mail = assignmentMail({ anfrage: { typ: 'partner', name: null }, code: 'ABCD-EFGH-JKLM', link, appName: 'Familie auf Pfoten' })
    expect(mail.subject).toBe('Euer Partner-Zugang für Familie auf Pfoten')
    expect(mail.body.startsWith('Hallo zusammen,')).toBe(true)
    expect(mail.body).toContain('hier ist euer Partner-Zugang für Familie auf Pfoten: ABCD-EFGH-JKLM')
    expect(mail.body).toContain(`Löst ihn unter ${link} ein`)
  })

  test('mailtoHref: Betreff und Text urlencodiert, die Adresse bleibt lesbar', () => {
    const href = mailtoHref('wilma@example.org', { subject: 'Dein Gutschein', body: 'Hallo,\ncode: A#B & mehr' })
    expect(href).toBe('mailto:wilma@example.org?subject=Dein%20Gutschein&body=Hallo%2C%0Acode%3A%20A%23B%20%26%20mehr')
    expect(mailtoHref('wilma@example.org')).toBe('mailto:wilma@example.org')
  })
})
