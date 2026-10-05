import { describe, expect, test } from 'vitest'
import {
  AMOUNT_TOO_LARGE,
  FINANZIERUNG_LIMITS,
  INVALID_AMOUNT,
  balkenBreiten,
  hinweisPayload,
  isSafeHttpUrl,
  quartalForm,
  quartalKurz,
  quartalLabel,
  quartalPayload,
  quartalSummen,
  zielPayload,
  zielText
} from './finanzierung.js'

// Phase F: Hilfen für „So finanzieren wir uns“ (FinanzierungPage) und die Admin-Pflege (AdminFinanzierung) - spiegeln
// server/lib/finanzierung.js.

const QUARTAL = {
  id: 7,
  jahr: 2026,
  quartal: 1,
  einnahmenSpendenCents: 12050,
  einnahmenPartnerCents: 0,
  kostenCents: 8900,
  spendenWeitergegebenCents: 3000,
  notiz: 'Server und Domain'
}

describe('Quartale lesen', () => {
  test('Bezeichnungen', () => {
    expect(quartalLabel(2026, 1)).toBe('1. Quartal 2026')
    expect(quartalKurz(2026, 3)).toBe('Q3 2026')
  })

  test('Summen: Einnahmen zusammen, Kosten, weitergegeben', () => {
    expect(quartalSummen(QUARTAL)).toEqual({ einnahmen: 12050, kosten: 8900, weitergegeben: 3000 })
  })

  test('Balkenbreiten in Prozent am größten Wert aller Quartale, nie über 100, bei 0 genau 0', () => {
    const breiten = balkenBreiten([QUARTAL, { ...QUARTAL, quartal: 2, einnahmenSpendenCents: 24100, kostenCents: 0 }])
    expect(breiten[1].einnahmen).toBe(100)
    expect(breiten[0].einnahmen).toBe(50)
    expect(breiten[1].kosten).toBe(0)
    expect(breiten[0].weitergegeben).toBeCloseTo(12.45, 1)
    // Ohne Zahlen (alles 0) bleibt alles 0, keine Division durch 0.
    expect(balkenBreiten([{ ...QUARTAL, einnahmenSpendenCents: 0, kostenCents: 0, spendenWeitergegebenCents: 0 }])[0]).toEqual({
      einnahmen: 0,
      kosten: 0,
      weitergegeben: 0
    })
  })

  test('Ziel als Satz: mit Betrag „Ziel: 500,00 € für …“, ohne Betrag nur der Titel, mit Empfänger ein Zusatz', () => {
    // Intl setzt ein geschütztes Leerzeichen vor das €-Zeichen.
    expect(zielText({ titel: 'Hundewiese am Deich', betragCents: 50000, empfaenger: null })).toMatch(/^Ziel: 500,00\s€ für Hundewiese am Deich$/)
    expect(zielText({ titel: 'Hundewiese am Deich', betragCents: null, empfaenger: 'Stadt' })).toBe('Ziel: Hundewiese am Deich')
  })

  test('nur http(s)-Adressen landen in einem Link', () => {
    expect(isSafeHttpUrl('https://example.org/spenden')).toBe(true)
    expect(isSafeHttpUrl('http://example.org')).toBe(true)
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeHttpUrl(null)).toBe(false)
  })
})

describe('Admin-Formulare: Euro rein, Cent raus', () => {
  test('Grenzen wie der Server', () => {
    expect(FINANZIERUNG_LIMITS).toEqual({ hinweisText: 400, zielTitel: 80, empfaenger: 120, notiz: 200, jahrMin: 2024, jahrMax: 2100 })
  })

  test('quartalForm: Strings für die Felder, leer für ein neues Quartal', () => {
    expect(quartalForm(QUARTAL)).toEqual({
      jahr: '2026',
      quartal: '1',
      einnahmenSpenden: '120,50',
      einnahmenPartner: '0,00',
      kosten: '89,00',
      spendenWeitergegeben: '30,00',
      notiz: 'Server und Domain'
    })
    expect(quartalForm(null, 2026)).toEqual({ jahr: '2026', quartal: '1', einnahmenSpenden: '', einnahmenPartner: '', kosten: '', spendenWeitergegeben: '', notiz: '' })
  })

  test('quartalPayload: gültig -> Cent und Ganzzahlen; leere Beträge zählen als 0', () => {
    const { payload, errors } = quartalPayload({ jahr: '2026', quartal: '2', einnahmenSpenden: '1.250,50', einnahmenPartner: '', kosten: '89', spendenWeitergegeben: '0', notiz: '  ' })
    expect(errors).toEqual({})
    expect(payload).toEqual({ jahr: 2026, quartal: 2, einnahmenSpendenCents: 125050, einnahmenPartnerCents: 0, kostenCents: 8900, spendenWeitergegebenCents: 0, notiz: '' })
  })

  test('quartalPayload: Fehler je Feld, payload dann null', () => {
    const { payload, errors } = quartalPayload({ jahr: '1999', quartal: '5', einnahmenSpenden: 'abc', einnahmenPartner: '-3', kosten: '1', spendenWeitergegeben: '2', notiz: 'x'.repeat(201) })
    expect(payload).toBeNull()
    expect(Object.keys(errors).sort()).toEqual(['einnahmenPartner', 'einnahmenSpenden', 'jahr', 'notiz', 'quartal'])
    expect(errors.jahr).toMatch(/2024/)
    expect(errors.quartal).toMatch(/1 bis 4/)
    expect(errors.einnahmenSpenden).toBe(INVALID_AMOUNT)
  })

  test('zu große Beträge bekommen eine freundliche Meldung statt des Server-Fehlers (Review L6)', () => {
    const base = { jahr: '2026', quartal: '1', einnahmenSpenden: '', einnahmenPartner: '', kosten: '', spendenWeitergegeben: '', notiz: '' }
    expect(quartalPayload({ ...base, kosten: '10.000.000,01' }).errors.kosten).toBe(AMOUNT_TOO_LARGE)
    expect(quartalPayload({ ...base, kosten: '10.000.000,00' }).payload.kostenCents).toBe(1e9)
    expect(zielPayload({ titel: 'x', betrag: '99999999999', empfaenger: '' }).errors.betrag).toBe(AMOUNT_TOO_LARGE)
  })

  test('zielPayload und hinweisPayload: Euro -> Cent, leer -> leer, Fehler am Feld', () => {
    expect(zielPayload({ titel: ' Hundewiese ', betrag: '500', empfaenger: '' })).toEqual({ payload: { titel: 'Hundewiese', betragCents: 50000, empfaenger: '' }, errors: {} })
    expect(zielPayload({ titel: '', betrag: '', empfaenger: '' })).toEqual({ payload: { titel: '', betragCents: null, empfaenger: '' }, errors: {} })
    expect(zielPayload({ titel: 'x', betrag: 'viel', empfaenger: '' }).errors.betrag).toMatch(/Betrag/)
    expect(hinweisPayload({ text: ' Konto ', url: ' https://example.org ' })).toEqual({ text: 'Konto', url: 'https://example.org' })
  })
})
