import { afterEach, describe, expect, test } from 'vitest'
import {
  ansageText,
  aufteilungText,
  deckungFuellstand,
  deckungText,
  eintragText,
  hatLiveDaten,
  kategorienText,
  spendeForm,
  spendePayload,
  vorleistungPayload,
  vorleistungText,
  zeitText
} from './spendenLive.js'
import spenden from './i18n/en/spenden.js'
import { setLang } from './i18n/index.js'

// „Spenden live“: Texte (Deckung, Zeit, Aufteilung nach der Regel, Anschub) und die Admin-Formulare.
const NOW = new Date(2026, 9, 10, 14, 0).getTime()
const LIVE = { summeMonat: 3000, summeJahr: 9000, summeGesamt: 12000, kostenMonat: 4000, deckungProzent: 75, letzte: [], vorleistung: null }

afterEach(() => setLang('de'))

describe('Spenden live: Texte', () => {
  test('Deckung: Prozent, gedeckt, ohne Kosten; Balken begrenzt', () => {
    expect(deckungText(74)).toBe('Diesen Monat sind 74 % der Kosten gedeckt.')
    expect(deckungText(120)).toBe('Diesen Monat sind die Kosten gedeckt – danke!')
    expect(deckungText(null)).toBe('Für diesen Monat sind keine laufenden Kosten eingetragen.')
    expect(deckungFuellstand(140)).toBe(100)
    expect(deckungFuellstand(null)).toBe(0)
  })

  test('Zeit: frisch relativ, sonst Datum; Eintrag mit „Anonym“', () => {
    const erfasst = new Date(NOW - 2 * 60 * 60 * 1000).toISOString()
    const eintrag = { betragCents: 2000, datum: '2026-10-10', erfasst, name: null, nachricht: 'Für die Fellnasen!', quelle: 'gofundme' }
    expect(zeitText(eintrag, NOW)).toBe('vor 2 Stunden')
    expect(zeitText({ ...eintrag, erfasst: new Date(NOW - 30 * 1000).toISOString() }, NOW)).toBe('gerade eben')
    expect(zeitText({ ...eintrag, datum: '2026-10-03', erfasst: '2026-10-03T08:00:00Z' }, NOW)).toMatch(/^am 3\. Okt/)
    expect(eintragText(eintrag, NOW)).toMatch(/^Anonym · 20,00\s€ · vor 2 Stunden$/)
    expect(eintragText({ ...eintrag, name: 'Wilma' }, NOW)).toMatch(/^Wilma · /)
  })

  test('Aufteilung: erst Kosten, dann Anschub, dann Rücklage und Weitergabe', () => {
    expect(aufteilungText(LIVE, null)).toBe('Die Spenden dieses Monats decken zuerst die laufenden Kosten.')
    const mitAnschub = { ...LIVE, summeMonat: 10000, vorleistung: { gesamtCents: 300000, gedecktCents: 6000, offenCents: 294000, kategorien: ['druck'] } }
    expect(aufteilungText(mitAnschub, null)).toMatch(/^Was nach den laufenden Kosten bleibt \(60,00\s€\), deckt zuerst den Anschub\.$/)
    const ueberschuss = { ...LIVE, summeMonat: 14000 }
    const finanz = { ruecklage: { centsAktuell: 0 }, kosten: { proJahrCents: 48000 } }
    expect(aufteilungText(ueberschuss, finanz)).toMatch(/bleiben 100,00\s€: 20,00\s€ \(20 %\) gehen in die Rücklage, 80,00\s€ an Tiere/)
  })

  test('Anschub und Kategorien neutral benannt', () => {
    expect(vorleistungText({ gesamtCents: 300000, gedecktCents: 40000, offenCents: 260000, kategorien: ['druck'] })).toMatch(
      /^Anschub \(Druck & Material\): 3\.000,00\s€ – davon gedeckt: 400,00\s€$/
    )
    expect(vorleistungText(null)).toBe('')
    expect(kategorienText([{ kategorie: 'druck' }, { kategorie: 'technik' }])).toBe('Laufende Kosten: Server & Technik · Druck & Material (Flyer, Karten)')
    expect(kategorienText([])).toBe('')
  })

  test('Ansage nur bei geänderter Monatssumme; Live-Daten erkennen', () => {
    expect(ansageText(null, LIVE)).toBeNull()
    expect(ansageText(LIVE, { ...LIVE, stand: 'neu' })).toBeNull()
    expect(ansageText(LIVE, { ...LIVE, summeMonat: 5000 })).toMatch(/^Neuer Stand: 50,00\s€ an Spenden diesen Monat\.$/)
    expect(hatLiveDaten({ ...LIVE, summeGesamt: 0, kostenMonat: 0 })).toBe(false)
    expect(hatLiveDaten(LIVE)).toBe(true)
  })

  test('Englisch: alle Texte übersetzt, Platzhalter bleiben', () => {
    for (const [key, value] of Object.entries(spenden)) expect(typeof value === 'string' && value.trim().length > 0, key).toBe(true)
    setLang('en')
    expect(deckungText(74)).toBe('This month, 74 % of the costs are covered.')
    expect(eintragText({ betragCents: 2000, datum: '2026-10-10', erfasst: new Date(NOW - 3600 * 1000).toISOString(), name: null }, NOW)).toMatch(/^Anonymous · .* · 1 hour ago$/)
    expect(kategorienText([{ kategorie: 'druck' }])).toBe('Running costs: Print & materials (flyers, cards)')
  })
})

describe('Spenden live: Admin-Formulare', () => {
  test('Spende: Euro in Cent, Datum Vorgabe heute, Fehler am Feld', () => {
    const leer = spendeForm(null, new Date(2026, 9, 10))
    expect(leer).toEqual({ betrag: '', datum: '2026-10-10', quelle: 'gofundme', anzeigename: '', nachricht: '', oeffentlich: true })
    expect(spendePayload({ ...leer, betrag: '20,00', anzeigename: ' Lotte ' }).payload).toEqual({
      betragCents: 2000,
      datum: '2026-10-10',
      quelle: 'gofundme',
      anzeigename: 'Lotte',
      nachricht: '',
      oeffentlich: true
    })
    const { payload, errors } = spendePayload({ ...leer, betrag: '0', nachricht: '<b>', quelle: 'bitcoin' })
    expect(payload).toBeNull()
    expect(Object.keys(errors).sort()).toEqual(['betrag', 'nachricht', 'quelle'])
    expect(spendePayload({ ...leer, betrag: '5', anzeigename: 'x'.repeat(41) }).errors.anzeigename).toBe('Höchstens 40 Zeichen.')
  })

  test('Anschub: Kategorie Pflicht, Betrag in Cent', () => {
    const form = { titel: 'Anschub', kategorie: 'druck', betrag: '3000', datum: '2026-09-01', notiz: '' }
    expect(vorleistungPayload(form).payload).toEqual({ titel: 'Anschub', kategorie: 'druck', betragCents: 300000, datum: '2026-09-01', notiz: '' })
    expect(vorleistungPayload({ ...form, kategorie: 'werbung' }).errors.kategorie).toBeTruthy()
  })
})
