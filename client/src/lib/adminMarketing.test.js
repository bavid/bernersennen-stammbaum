import { describe, expect, test } from 'vitest'
import {
  donationErrorField,
  formatZeitraum,
  initialDonationForm,
  initialPromotionForm,
  parseDonationForm,
  promotionClientErrors,
  promotionErrorField,
  settingsError,
  toPromotionPayload
} from './adminMarketing.js'

const promotionRow = {
  id: 7,
  partner_id: 3,
  bereich: 'futter',
  kennzeichnung: 'Empfehlung',
  empfohlen_von: 'Hundeschule Pfotenglück',
  titel: 'Knusperkorn Sensitive',
  text: 'Getreidefrei.',
  url: 'https://example.org/knusperkorn',
  tierart: 'hund',
  aktiv: 0,
  start: '2026-05-01',
  ende: '2026-06-30',
  sort: 4
}

describe('Empfehlungs-Formular: Server-Zeile <-> Formular <-> Payload', () => {
  test('ein leeres Formular startet als aktive Anzeige ohne Zeitraum', () => {
    const form = initialPromotionForm(null)
    expect(form).toMatchObject({ kennzeichnung: 'Anzeige', aktiv: true, titel: '', partnerId: '', sort: '0' })
  })

  test('eine Server-Zeile (snake_case) wird vorbefüllt und als camelCase-Payload zurückgeschickt', () => {
    const payload = toPromotionPayload(initialPromotionForm(promotionRow))
    expect(payload).toEqual({
      bereich: 'futter',
      kennzeichnung: 'Empfehlung',
      empfohlenVon: 'Hundeschule Pfotenglück',
      titel: 'Knusperkorn Sensitive',
      text: 'Getreidefrei.',
      url: 'https://example.org/knusperkorn',
      tierart: 'hund',
      partnerId: 3,
      aktiv: false,
      start: '2026-05-01',
      ende: '2026-06-30',
      sort: 4
    })
  })

  test('leere optionale Felder werden null, sort ohne gültige Ganzzahl wird 0', () => {
    const payload = toPromotionPayload({ ...initialPromotionForm(null), bereich: 'hundeschule', titel: 'Welpenkurs', sort: 'abc' })
    expect(payload).toMatchObject({ text: null, url: null, empfohlenVon: null, tierart: null, partnerId: null, start: null, ende: null, sort: 0 })
    expect(toPromotionPayload({ ...initialPromotionForm(null), sort: '2.5' }).sort).toBe(0)
    expect(toPromotionPayload({ ...initialPromotionForm(null), sort: '-3' }).sort).toBe(-3)
  })
})

describe('promotionErrorField – Server-Meldung (server/lib/promotions.js) -> Formularfeld', () => {
  test.each([
    ['Bereich muss einer von futter, hundeschule, begleiter, unterstuetzen sein', 'bereich'],
    ['Kennzeichnung muss einer von Anzeige, Empfehlung, Partner sein', 'kennzeichnung'],
    ['Der Titel ist Pflicht', 'titel'],
    ['Der Titel darf höchstens 120 Zeichen haben', 'titel'],
    ['Der Text darf höchstens 600 Zeichen haben', 'text'],
    ['Bei einer Empfehlung ist „Empfehlung von“ Pflicht', 'empfohlenVon'],
    ['„Empfehlung von“ darf höchstens 120 Zeichen haben', 'empfohlenVon'],
    ['Der Link: ungültige Adresse', 'url'],
    ['Der Start: ungültiges Datum (JJJJ-MM-TT)', 'start'],
    ['Das Ende: ungültiges Datum (JJJJ-MM-TT)', 'ende'],
    ['Das Ende darf nicht vor dem Start liegen', 'ende'],
    ['Tierart muss einer von hund, katze, anderes sein', 'tierart'],
    ['Diesen Partner gibt es nicht', 'partnerId']
  ])('%s -> %s', (message, field) => {
    expect(promotionErrorField(message)).toBe(field)
  })

  test('nicht zuordenbare Meldungen (z. B. breederGuard) -> null (oben anzeigen)', () => {
    expect(promotionErrorField('Züchter und Zucht-Angebote werden hier nicht aufgenommen.')).toBeNull()
    expect(promotionErrorField('Fehler 500')).toBeNull()
    expect(promotionErrorField(undefined)).toBeNull()
  })
})

describe('formatZeitraum', () => {
  test.each([
    ['2026-05-01', '2026-06-30', '01.05.2026 – 30.06.2026'],
    ['2026-05-01', null, 'ab 01.05.2026'],
    [null, '2026-06-30', 'bis 30.06.2026'],
    [null, null, 'unbefristet'],
    ['', '', 'unbefristet']
  ])('%s / %s -> %s', (start, ende, text) => {
    expect(formatZeitraum(start, ende)).toBe(text)
  })
})

describe('Spendenbericht-Formular: Euro rein, Cent raus', () => {
  const filled = {
    zeitraum: '2026 Q3',
    eingang: '1.250,50',
    kosten: '180',
    weitergeleitet: '1000.5',
    empfaenger: 'Tierheim Sonnenhang',
    nachweisUrl: 'https://example.org/nachweis'
  }

  test('gültige Eingaben werden in Cent umgerechnet', () => {
    const { payload, errors } = parseDonationForm(filled)
    expect(errors).toEqual({})
    expect(payload).toEqual({
      zeitraum: '2026 Q3',
      eingangCents: 125050,
      kostenCents: 18000,
      weitergeleitetCents: 100050,
      empfaenger: 'Tierheim Sonnenhang',
      nachweisUrl: 'https://example.org/nachweis'
    })
  })

  test('negative oder unlesbare Beträge ergeben Feldfehler und kein Payload', () => {
    const { payload, errors } = parseDonationForm({ ...filled, eingang: '-5', kosten: 'viel', weitergeleitet: '' })
    expect(payload).toBeNull()
    expect(Object.keys(errors).sort()).toEqual(['eingang', 'kosten', 'weitergeleitet'])
  })

  test('mehr als der Server annimmt (1e9 Cent) wird in Euro erklärt abgelehnt', () => {
    expect(parseDonationForm({ ...filled, eingang: '10.000.000,00' }).errors).toEqual({})
    const { payload, errors } = parseDonationForm({ ...filled, eingang: '10.000.000,01' })
    expect(payload).toBeNull()
    expect(errors).toEqual({ eingang: 'Höchstens 10.000.000,00 € pro Betrag.' })
  })

  test('ohne Zeitraum gibt es einen Feldfehler', () => {
    const { payload, errors } = parseDonationForm({ ...filled, zeitraum: '  ' })
    expect(payload).toBeNull()
    expect(errors).toEqual({ zeitraum: 'Der Zeitraum ist Pflicht' })
  })

  test('leere optionale Felder werden null', () => {
    const { payload } = parseDonationForm({ ...filled, empfaenger: ' ', nachweisUrl: '' })
    expect(payload.empfaenger).toBeNull()
    expect(payload.nachweisUrl).toBeNull()
  })

  test('ein bestehender Bericht wird mit Euro-Werten vorbefüllt', () => {
    const form = initialDonationForm({
      zeitraum: '2026 Q2',
      eingang_cents: 125050,
      kosten_cents: 0,
      weitergeleitet_cents: 99,
      empfaenger: null,
      nachweis_url: null
    })
    expect(form).toEqual({ zeitraum: '2026 Q2', eingang: '1250,50', kosten: '0,00', weitergeleitet: '0,99', empfaenger: '', nachweisUrl: '' })
  })
})

describe('donationErrorField – Server-Meldung -> Formularfeld', () => {
  test.each([
    ['Der Zeitraum ist Pflicht', 'zeitraum'],
    ['Der Eingang muss eine ganze Zahl zwischen 0 und 1000000000 sein (Cent)', 'eingang'],
    ['Die Kosten muss eine ganze Zahl zwischen 0 und 1000000000 sein (Cent)', 'kosten'],
    ['Der weitergeleitete Betrag muss eine ganze Zahl zwischen 0 und 1000000000 sein (Cent)', 'weitergeleitet'],
    ['Der Empfänger darf höchstens 120 Zeichen haben', 'empfaenger'],
    ['Der Nachweis-Link: ungültige Adresse', 'nachweisUrl']
  ])('%s -> %s', (message, field) => {
    expect(donationErrorField(message)).toBe(field)
  })

  test('Unbekanntes -> null', () => {
    expect(donationErrorField('Diesen Spendenbericht gibt es nicht')).toBeNull()
  })
})

describe('promotionClientErrors – Pflichtfelder vor dem Senden', () => {
  test('Titel ist Pflicht, "Empfohlen von" nur bei einer Empfehlung', () => {
    const init = initialPromotionForm
    expect(promotionClientErrors({ ...init(null), titel: '  ' })).toEqual({ titel: 'Der Titel ist Pflicht' })
    expect(promotionClientErrors({ ...init(null), titel: 'Welpenkurs' })).toEqual({})
    expect(promotionClientErrors({ ...init(null), titel: 'Welpenkurs', kennzeichnung: 'Empfehlung', empfohlenVon: ' ' })).toEqual({
      empfohlenVon: 'Bei einer Empfehlung ist „Empfehlung von“ Pflicht'
    })
    expect(
      promotionClientErrors({ ...init(null), titel: 'Welpenkurs', kennzeichnung: 'Empfehlung', empfohlenVon: 'Tierheim Sonnenhang' })
    ).toEqual({})
  })
})

describe('settingsError – Meldung von PUT /api/admin/settings -> Feld mit lesbarem Text', () => {
  test('GoFundMe-Link und Text werden zugeordnet, der technische Schlüssel ersetzt', () => {
    expect(settingsError('gofundme_url: ungültige Adresse')).toEqual({ field: 'gofundmeUrl', message: 'Der GoFundMe-Link: ungültige Adresse' })
    expect(settingsError('unterstuetzen_text darf höchstens 600 Zeichen haben')).toEqual({
      field: 'text',
      message: 'Der Text darf höchstens 600 Zeichen haben'
    })
  })

  test('Unbekanntes -> null (oben anzeigen)', () => {
    expect(settingsError('Unbekannte Einstellung: x')).toBeNull()
    expect(settingsError(undefined)).toBeNull()
  })
})
