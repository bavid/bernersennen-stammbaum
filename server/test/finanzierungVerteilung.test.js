const test = require('node:test')
const assert = require('node:assert/strict')

// Spendenrechnung mit der Rücklage „Server-Zukunft“ (lib/finanzierungVerteilung.js) - reine Funktionen ohne Datenbank.
// Regel des Betreibers: vom Überschuss (Spenden − Kosten, nie unter 0) gehen 20 % in die Rücklage, solange sie weniger als
// ein Jahr der Jahreskosten deckt; 10 % ab einem Jahr, 5 % ab zwei, 0 % ab drei Jahren (alles wird gespendet).
const {
  RUECKLAGE_STUFEN,
  ruecklageAnteilProzent,
  ruecklageJahre,
  verteileUeberschuss,
  monatsrateCents,
  kostenProJahrCents,
  kostenBisherCents,
  quartalKostenCents,
  restKostenJahrCents,
  berechneFinanzen
} = require('../lib/finanzierungVerteilung')

const HEUTE = new Date(2026, 9, 5) // 5. Oktober 2026 (lokal)

test('Verteilung: Stufen der Rücklage nach gedeckten Jahren', () => {
  assert.deepEqual(RUECKLAGE_STUFEN, [
    { abJahren: 3, prozent: 0 },
    { abJahren: 2, prozent: 5 },
    { abJahren: 1, prozent: 10 },
    { abJahren: 0, prozent: 20 }
  ])
  const jahr = 120000 // 1.200 € Jahreskosten
  assert.equal(ruecklageAnteilProzent(0, jahr), 20)
  assert.equal(ruecklageAnteilProzent(Math.round(0.99 * jahr), jahr), 20)
  assert.equal(ruecklageAnteilProzent(jahr, jahr), 10)
  assert.equal(ruecklageAnteilProzent(2 * jahr - 1, jahr), 10)
  assert.equal(ruecklageAnteilProzent(2 * jahr, jahr), 5)
  assert.equal(ruecklageAnteilProzent(3 * jahr - 1, jahr), 5)
  assert.equal(ruecklageAnteilProzent(3 * jahr, jahr), 0)
  // Ohne Jahreskosten gilt die Rücklage als voll gedeckt: nichts zurücklegen, alles spenden.
  assert.equal(ruecklageAnteilProzent(0, 0), 0)
  assert.equal(ruecklageAnteilProzent(5000, 0), 0)
  assert.equal(ruecklageJahre(0, 0), null)
  assert.equal(ruecklageJahre(48000, 120000), 0.4)
  assert.equal(ruecklageJahre(-10, 120000), 0)
})

test('Verteilung: verteileUeberschuss - Beispiel des Betreibers und Grenzfälle', () => {
  // Kosten 100 €, Spenden 1.000 € -> Überschuss 900 €, Rücklage < 1 Jahr -> 180 € Rücklage, 720 € gespendet.
  assert.deepEqual(verteileUeberschuss({ spendenCents: 100000, kostenCents: 10000, ruecklageCents: 0, kostenProJahrCents: 40000 }), {
    ueberschussCents: 90000,
    anteilProzent: 20,
    reserveCents: 18000,
    gespendetCents: 72000
  })
  // Rücklage deckt genau ein Jahr -> 10 %.
  assert.deepEqual(verteileUeberschuss({ spendenCents: 100000, kostenCents: 10000, ruecklageCents: 40000, kostenProJahrCents: 40000 }), {
    ueberschussCents: 90000,
    anteilProzent: 10,
    reserveCents: 9000,
    gespendetCents: 81000
  })
  // Drei Jahre gedeckt -> alles gespendet.
  assert.deepEqual(verteileUeberschuss({ spendenCents: 100000, kostenCents: 10000, ruecklageCents: 120000, kostenProJahrCents: 40000 }), {
    ueberschussCents: 90000,
    anteilProzent: 0,
    reserveCents: 0,
    gespendetCents: 90000
  })
  // Negativer Überschuss (Minus): nichts zu verteilen.
  assert.deepEqual(verteileUeberschuss({ spendenCents: 5000, kostenCents: 10000, ruecklageCents: 0, kostenProJahrCents: 40000 }), {
    ueberschussCents: 0,
    anteilProzent: 20,
    reserveCents: 0,
    gespendetCents: 0
  })
  // Ohne Jahreskosten: 0 % Rücklage.
  assert.deepEqual(verteileUeberschuss({ spendenCents: 1000, kostenCents: 0, kostenProJahrCents: 0 }), {
    ueberschussCents: 1000,
    anteilProzent: 0,
    reserveCents: 0,
    gespendetCents: 1000
  })
  // Rundung: 20 % von 333 Cent = 66,6 -> 67 Cent Rücklage, der Rest gespendet; die Summe stimmt immer.
  const krumm = verteileUeberschuss({ spendenCents: 333, kostenCents: 0, ruecklageCents: 0, kostenProJahrCents: 100 })
  assert.equal(krumm.reserveCents, 67)
  assert.equal(krumm.reserveCents + krumm.gespendetCents, 333)
})

const SERVER = { titel: 'Server', betragCents: 2300, intervall: 'monat', ab: '2026-01-01', bis: null }
const DOMAIN = { titel: 'Domain', betragCents: 1200, intervall: 'jahr', ab: '2026-03-15', bis: null }
const ALT = { titel: 'Alter Tarif', betragCents: 1000, intervall: 'monat', ab: '2025-01-01', bis: '2025-12-31' }

test('Verteilung: Monatsrate, Jahreskosten und bisherige Kosten aus Posten und Quartalen', () => {
  assert.equal(monatsrateCents(SERVER), 2300)
  assert.equal(monatsrateCents(DOMAIN), 100)

  // Hochrechnung pro Jahr: laufende Posten (Monat × 12, Jahr × 1) - beendete zählen nicht - plus der Durchschnitt der
  // einmaligen Quartalskosten aufs Jahr (Summe / Anzahl Quartale × 4).
  assert.equal(kostenProJahrCents([SERVER, DOMAIN, ALT], [], HEUTE), 2300 * 12 + 1200)
  const quartale = [
    { jahr: 2026, quartal: 1, einnahmenSpendenCents: 10000, kostenCents: 4000, reserveEntnahmeCents: 0 },
    { jahr: 2026, quartal: 2, einnahmenSpendenCents: 20000, kostenCents: 0, reserveEntnahmeCents: 0 }
  ]
  assert.equal(kostenProJahrCents([], quartale, HEUTE), 8000) // (4000 + 0) / 2 × 4
  assert.equal(kostenProJahrCents([SERVER], quartale, HEUTE), 27600 + 8000)
  assert.equal(kostenProJahrCents([], [], HEUTE), 0)

  // Bisher: Server seit Januar 2026 bis Oktober = 10 Monate; Domain seit März = 8 Monate × 100; Alt-Tarif 2025 = 12 Monate;
  // dazu die einmaligen Quartalskosten.
  assert.equal(kostenBisherCents([SERVER, DOMAIN, ALT], quartale, HEUTE), 10 * 2300 + 8 * 100 + 12 * 1000 + 4000)
  // Ein Posten in der Zukunft zählt noch nicht.
  assert.equal(kostenBisherCents([{ ...SERVER, ab: '2027-01-01' }], [], HEUTE), 0)

  // Kosten eines Quartals: einmalige plus die laufenden Monate darin (Domain ab März: im 1. Quartal ein Monat).
  assert.equal(quartalKostenCents([SERVER, DOMAIN], quartale[0]), 4000 + 3 * 2300 + 100)
  assert.equal(quartalKostenCents([SERVER, DOMAIN], quartale[1]), 3 * 2300 + 300)
  assert.equal(quartalKostenCents([ALT], quartale[0]), 4000)

  // Rest bis Jahresende: nach Oktober bleiben November und Dezember.
  assert.equal(restKostenJahrCents([SERVER, DOMAIN, ALT], HEUTE), 2 * 2300 + 2 * 100)
  assert.equal(restKostenJahrCents([SERVER], new Date(2026, 11, 20)), 0)
})

test('Verteilung: berechneFinanzen - Saldo, Prognose, Rücklage und Verteilung je Quartal mit Übertrag', () => {
  const posten = [{ titel: 'Server', betragCents: 10000, intervall: 'monat', ab: '2026-01-01', bis: null }] // 100 €/Monat
  const quartale = [
    // Neueste zuerst wie der Server sie liefert - die Rechnung sortiert selbst chronologisch.
    { jahr: 2026, quartal: 2, einnahmenSpendenCents: 60000, kostenCents: 0, reserveEntnahmeCents: 5000 },
    { jahr: 2026, quartal: 1, einnahmenSpendenCents: 130000, kostenCents: 0, reserveEntnahmeCents: 0 }
  ]
  const f = berechneFinanzen({ quartale, posten, heute: HEUTE })

  assert.equal(f.kostenProJahrCents, 120000)
  assert.equal(f.spendenBisherCents, 190000)
  assert.equal(f.kostenBisherCents, 100000) // Januar bis Oktober
  assert.equal(f.saldoCents, 90000)
  assert.equal(f.restKostenJahrCents, 20000)
  assert.equal(f.prognoseJahresendeCents, 70000)

  // Q1: Kosten 300 €, Überschuss 1.000 €, Rücklage 0 -> 20 % = 200 € Rücklage, 800 € gespendet.
  // Q2: Kosten 300 €, Überschuss 300 €, Rücklage 200 € (< 1 Jahr) -> 20 % = 60 €; danach 200 + 60 − 50 Entnahme = 210 €.
  assert.deepEqual(f.verteilung, [
    { jahr: 2026, quartal: 1, kostenCents: 30000, ueberschussCents: 100000, anteilProzent: 20, reserveCents: 20000, gespendetCents: 80000, entnahmeCents: 0, ruecklageDanachCents: 20000 },
    { jahr: 2026, quartal: 2, kostenCents: 30000, ueberschussCents: 30000, anteilProzent: 20, reserveCents: 6000, gespendetCents: 24000, entnahmeCents: 5000, ruecklageDanachCents: 21000 }
  ])
  assert.deepEqual(f.ruecklage, { centsAktuell: 21000, jahreGedeckt: 0.2, anteilProzent: 20 })

  // Im Minus: ehrlich negativ.
  const minus = berechneFinanzen({ quartale: [{ jahr: 2026, quartal: 1, einnahmenSpendenCents: 1000, kostenCents: 0, reserveEntnahmeCents: 0 }], posten, heute: HEUTE })
  assert.equal(minus.saldoCents, 1000 - 100000)
  assert.equal(minus.prognoseJahresendeCents, 1000 - 100000 - 20000)
  assert.deepEqual(minus.ruecklage, { centsAktuell: 0, jahreGedeckt: 0, anteilProzent: 20 })

  // Ohne alles: Nullen, Rücklage ohne Jahreskosten „voll gedeckt“ (null Jahre, 0 %).
  const leer = berechneFinanzen({ quartale: [], posten: [], heute: HEUTE })
  assert.deepEqual(leer, {
    kostenProJahrCents: 0,
    kostenBisherCents: 0,
    spendenBisherCents: 0,
    saldoCents: 0,
    restKostenJahrCents: 0,
    prognoseJahresendeCents: 0,
    ruecklage: { centsAktuell: 0, jahreGedeckt: null, anteilProzent: 0 },
    verteilung: []
  })

  // Eine Entnahme größer als die Rücklage leert sie nur - nie unter 0.
  const entnahme = berechneFinanzen({
    quartale: [{ jahr: 2026, quartal: 1, einnahmenSpendenCents: 40000, kostenCents: 0, reserveEntnahmeCents: 99999 }],
    posten,
    heute: HEUTE
  })
  assert.equal(entnahme.verteilung[0].ruecklageDanachCents, 0)
})
