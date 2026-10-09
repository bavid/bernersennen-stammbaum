import { describe, expect, test } from 'vitest'
import { formatEuroCents } from './discover.js'
import {
  REGEL_TEXT,
  adminSaldoText,
  formatJahre,
  hatFinanzDaten,
  kostenForm,
  kostenPayload,
  postenText,
  prognoseText,
  ruecklageAnteilProzent,
  ruecklageFuellstand,
  ruecklageText,
  saldoText,
  verteileUeberschuss
} from './finanzierungRuecklage.js'

const euro = (cents) => formatEuroCents(cents)

describe('Spendenrechnung (Spiegel des Servers)', () => {
  test('Stufen: < 1 Jahr 20 %, ab 1 Jahr 10 %, ab 2 Jahren 5 %, ab 3 Jahren 0 %, ohne Jahreskosten 0 %', () => {
    const jahr = 120000
    expect(ruecklageAnteilProzent(Math.round(0.99 * jahr), jahr)).toBe(20)
    expect(ruecklageAnteilProzent(jahr, jahr)).toBe(10)
    expect(ruecklageAnteilProzent(2 * jahr, jahr)).toBe(5)
    expect(ruecklageAnteilProzent(3 * jahr, jahr)).toBe(0)
    expect(ruecklageAnteilProzent(0, 0)).toBe(0)
  })

  test('Beispiel des Betreibers: Kosten 100 €, Spenden 1.000 € -> 180 € Rücklage, 720 € gespendet; Minus verteilt nichts', () => {
    expect(verteileUeberschuss({ spendenCents: 100000, kostenCents: 10000, ruecklageCents: 0, kostenProJahrCents: 40000 })).toEqual({
      ueberschussCents: 90000,
      anteilProzent: 20,
      reserveCents: 18000,
      gespendetCents: 72000
    })
    expect(verteileUeberschuss({ spendenCents: 100, kostenCents: 5000, kostenProJahrCents: 40000 }).ueberschussCents).toBe(0)
  })
})

describe('Texte', () => {
  test('Jahre, Rücklage und Füllstand', () => {
    expect(formatJahre(0.4)).toBe('0,4 Jahre')
    expect(formatJahre(1)).toBe('1 Jahr')
    expect(formatJahre(2.5)).toBe('2,5 Jahre')
    expect(formatJahre(null)).toBeNull()
    expect(ruecklageText({ jahreGedeckt: 0.4 })).toBe('Rücklage: deckt 0,4 Jahre')
    expect(ruecklageText({ jahreGedeckt: null })).toBe('Rücklage: noch keine laufenden Kosten')
    expect(ruecklageFuellstand(1.5)).toBe(50)
    expect(ruecklageFuellstand(9)).toBe(100)
    expect(ruecklageFuellstand(null)).toBe(100)
  })

  test('Saldo öffentlich und im Admin, Prognose, Posten', () => {
    expect(saldoText(-34000)).toBe(`Zurzeit tragen wir ${euro(34000)} selbst.`)
    expect(saldoText(12000)).toBe(`Zurzeit liegen wir ${euro(12000)} im Plus.`)
    expect(saldoText(0)).toMatch(/Waage/)
    expect(adminSaldoText(-34000)).toBe(`Du bist ${euro(34000)} im Minus`)
    expect(adminSaldoText(500)).toBe(`Du bist ${euro(500)} im Plus`)
    expect(prognoseText(-5000)).toBe(`Bei gleichbleibenden Kosten fehlen bis Jahresende ${euro(5000)}.`)
    expect(prognoseText(5000)).toMatch(/bleiben bis Jahresende/)
    expect(postenText({ titel: 'Server', betragCents: 2300, intervall: 'monat' })).toBe(`Server: ${euro(2300)} im Monat`)
    expect(REGEL_TEXT).toMatch(/^Vom Überschuss legen wir anfangs 20 %/)
    expect(hatFinanzDaten({ quartale: [], kosten: { posten: [] } })).toBe(false)
    expect(hatFinanzDaten({ quartale: [], kosten: { posten: [{}] } })).toBe(true)
  })
})

describe('Formular eines Postens', () => {
  test('Vorgaben, Nutzlast in Cent und Fehler je Feld', () => {
    const leer = kostenForm(null, new Date(2026, 9, 5))
    expect(leer).toEqual({ titel: '', betrag: '', intervall: 'monat', ab: '2026-10-05', bis: '', notiz: '' })
    expect(kostenPayload({ ...leer, titel: ' Server ', betrag: '23,00' }).payload).toEqual({
      titel: 'Server',
      betragCents: 2300,
      intervall: 'monat',
      ab: '2026-10-05',
      bis: null,
      notiz: ''
    })
    const { payload, errors } = kostenPayload({ ...leer, betrag: '0', bis: '2026-01-01' })
    expect(payload).toBeNull()
    expect(Object.keys(errors).sort()).toEqual(['betrag', 'bis', 'titel'])
    expect(kostenForm({ titel: 'Domain', betragCents: 1200, intervall: 'jahr', ab: '2026-03-15', bis: null, notiz: null })).toEqual({
      titel: 'Domain',
      betrag: '12,00',
      intervall: 'jahr',
      ab: '2026-03-15',
      bis: '',
      notiz: ''
    })
  })
})
