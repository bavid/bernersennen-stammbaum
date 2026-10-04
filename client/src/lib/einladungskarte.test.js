import { describe, expect, test } from 'vitest'
import {
  DEFAULT_KARTEN,
  MAX_KARTEN,
  RUECKSEITE_LIMITS,
  RUECKSEITE_VORGABEN,
  buildKartenSheets,
  clampKarten,
  rueckseiteClientErrors,
  rueckseiteForm,
  rueckseiteModel,
  rueckseitePayload,
  sheetCountFor
} from './einladungskarte.js'

describe('Rückseite', () => {
  test('Vorgaben wie der Server, ohne "ohne Werbung"; die Adresse ohne Eintrag = die Adresse des QR-Codes', () => {
    expect(RUECKSEITE_VORGABEN.titel).toBe('Eure Tierchronik – geschenkt')
    expect(RUECKSEITE_VORGABEN.schritte).toHaveLength(3)
    expect(JSON.stringify(RUECKSEITE_VORGABEN)).not.toMatch(/werbung/i)
    expect(RUECKSEITE_LIMITS).toEqual({ titel: 60, text: 240, schritt: 60, schritte: 3, adresse: 60 })
    const card = { host: 'beispiel-chronik.de' }
    expect(rueckseiteModel({ ...RUECKSEITE_VORGABEN, adresse: '' }, card).adresse).toBe('beispiel-chronik.de/v')
    expect(rueckseiteModel({ ...RUECKSEITE_VORGABEN, adresse: 'pfoten.example/v' }, card).adresse).toBe('pfoten.example/v')
    // Fehlt die Rückseite (alter Stand), gelten die Vorgaben.
    expect(rueckseiteModel(undefined, card).titel).toBe(RUECKSEITE_VORGABEN.titel)
    // Ohne öffentliche Adresse ein Platzhalter statt des Hosts (Feedback-Runde).
    expect(rueckseiteModel(RUECKSEITE_VORGABEN, { host: 'Adresse folgt', addressPending: true }).adresse).toBe('Adresse folgt')
  })

  test('Formular im Admin: drei Schritt-Felder, alle gesendet (leere lässt der Server weg); Titel und Text sind Pflicht', () => {
    const form = rueckseiteForm({ ...RUECKSEITE_VORGABEN, schritte: ['Scannen', 'Code eingeben'] })
    expect(form).toEqual({ titel: RUECKSEITE_VORGABEN.titel, text: RUECKSEITE_VORGABEN.text, schritt1: 'Scannen', schritt2: 'Code eingeben', schritt3: '', adresse: '' })
    expect(rueckseitePayload({ ...form, schritt1: '  ', schritt3: ' Loslegen ' })).toEqual({
      titel: RUECKSEITE_VORGABEN.titel,
      text: RUECKSEITE_VORGABEN.text,
      schritte: ['', 'Code eingeben', 'Loslegen'],
      adresse: ''
    })
    // Die Vorschau zeigt nur ausgefüllte Schritte.
    expect(rueckseiteModel({ ...RUECKSEITE_VORGABEN, schritte: ['', 'Code eingeben', ''] }, { host: 'x.de' }).schritte).toEqual(['Code eingeben'])
    expect(rueckseiteClientErrors(form)).toEqual({})
    expect(rueckseiteClientErrors({ ...form, titel: ' ', text: '' })).toEqual({ titel: 'Bitte gib einen Titel an.', text: 'Bitte gib einen Text an.' })
  })
})

describe('Druck nach Kartenzahl', () => {
  test('1 bis 50 Karten, Vorgabe 10; Bögen aufgerundet', () => {
    expect([DEFAULT_KARTEN, MAX_KARTEN]).toEqual([10, 50])
    expect([clampKarten(0), clampKarten(7.4), clampKarten(99), clampKarten('x')]).toEqual([1, 7, 50, 1])
    expect([sheetCountFor(1), sheetCountFor(10), sheetCountFor(11), sheetCountFor(50)]).toEqual([1, 1, 2, 5])
  })

  test('angebrochener Bogen: leere Plätze bleiben leer, die Rückseiten gespiegelt hinter ihrer Karte', () => {
    const codes = ['A', 'B', 'C']
    const [sheet, ...rest] = buildKartenSheets({ count: 3, codes })
    expect(rest).toHaveLength(0)
    expect(sheet.fronts).toEqual([0, 1, 2, null, null, null, null, null, null, null])
    expect(sheet.backs.slice(0, 4)).toEqual([
      { index: 1, code: 'B' },
      { index: 0, code: 'A' },
      null,
      { index: 2, code: 'C' }
    ])
    expect(sheet.backs.slice(4).every((back) => back === null)).toBe(true)
  })

  test('mehrere Bögen: jede Karte genau einmal, ohne Code keine Rückseite', () => {
    const sheets = buildKartenSheets({ count: 12, codes: [] })
    expect(sheets.map((sheet) => sheet.number)).toEqual([1, 2])
    expect(sheets.flatMap((sheet) => sheet.fronts).filter((index) => index !== null)).toEqual([...Array(12).keys()])
    expect(sheets[1].backs.filter(Boolean).map((back) => back.code)).toEqual([null, null])
    expect(buildKartenSheets({ count: 0, codes: [] })).toEqual([])
  })
})
