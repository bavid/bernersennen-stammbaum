'use strict'

// Spendenrechnung mit der Rücklage „Server-Zukunft“ - reine Funktionen ohne Datenbank, Spiegel in
// client/src/lib/finanzierungRuecklage.js. Regel des Betreibers (05.10.): Überschuss = Spenden − Kosten (nie unter 0). Vom
// Überschuss geht ein Anteil in die Rücklage, mit der die Betriebskosten im Voraus gesammelt werden, der Rest wird
// gespendet: 20 %, solange die Rücklage weniger als ein Jahr der Jahreskosten deckt; 10 % ab einem Jahr; 5 % ab zwei;
// 0 % (alles gespendet) ab drei Jahren. Ohne Jahreskosten gilt die Rücklage als voll gedeckt (0 %).
// Jahreskosten = Hochrechnung aus den laufenden Posten (lib/finanzierungKosten.js: Monat × 12, Jahr × 1) plus dem
// Durchschnitt der einmaligen Quartalskosten (finanzierung_quartale.kosten_cents) aufs Jahr. Jahresbeträge werden für die
// Rechnung je Monat auf zwölf Monatsraten verteilt. Die Rücklage wird nie gespeichert, sondern aus allen Quartalen
// chronologisch berechnet (Anteile hinzu, Entnahmen des Admins ab - reserve_entnahme_cents je Quartal, nie unter 0).
// Der Anteil je Quartal richtet sich nach dem Stand der Rücklage VOR diesem Quartal und den heutigen Jahreskosten.

const RUECKLAGE_STUFEN = Object.freeze([
  { abJahren: 3, prozent: 0 },
  { abJahren: 2, prozent: 5 },
  { abJahren: 1, prozent: 10 },
  { abJahren: 0, prozent: 20 }
].map(Object.freeze))

const MONATE_JE_JAHR = 12
const MONATE_JE_QUARTAL = 3
const QUARTALE_JE_JAHR = 4

// Wie viele Jahre der Jahreskosten deckt die Rücklage? null ohne Jahreskosten (dann gilt sie als voll gedeckt).
function ruecklageJahre(ruecklageCents, kostenProJahrCents) {
  if (!(kostenProJahrCents > 0)) return null
  return Math.max(0, ruecklageCents) / kostenProJahrCents
}

function ruecklageAnteilProzent(ruecklageCents, kostenProJahrCents) {
  const jahre = ruecklageJahre(ruecklageCents, kostenProJahrCents)
  if (jahre === null) return 0
  return RUECKLAGE_STUFEN.find((stufe) => jahre >= stufe.abJahren).prozent
}

// Ein Überschuss verteilt: { ueberschussCents, anteilProzent, reserveCents, gespendetCents } - Rücklage kaufmännisch
// gerundet, der Rest gespendet, die Summe ist immer der Überschuss.
function verteileUeberschuss({ spendenCents, kostenCents, ruecklageCents = 0, kostenProJahrCents }) {
  const ueberschussCents = Math.max(0, (spendenCents || 0) - (kostenCents || 0))
  const anteilProzent = ruecklageAnteilProzent(ruecklageCents, kostenProJahrCents)
  const reserveCents = Math.round((ueberschussCents * anteilProzent) / 100)
  return { ueberschussCents, anteilProzent, reserveCents, gespendetCents: ueberschussCents - reserveCents }
}

// --- Posten (laufende Kosten) ------------------------------------------------------------------------------------------

// Monatsrate eines Postens in Cent (Jahresbeträge auf zwölf Monate verteilt, darum nicht immer ganzzahlig).
function monatsrateCents(posten) {
  return posten.intervall === 'jahr' ? posten.betragCents / MONATE_JE_JAHR : posten.betragCents
}

// Monate als fortlaufende Zahl (Jahr × 12 + Monat), aus 'JJJJ-MM-TT' bzw. einem Date (lokal).
function monatsIndex(datum) {
  if (datum instanceof Date) return datum.getFullYear() * MONATE_JE_JAHR + datum.getMonth()
  const [jahr, monat] = String(datum).split('-').map(Number)
  return jahr * MONATE_JE_JAHR + (monat - 1)
}

// Monate, in denen der Posten innerhalb [vonIdx, bisIdx] läuft (Monat des Beginns zählt mit, Monat des Endes auch).
function monateAktiv(posten, vonIdx, bisIdx) {
  const start = Math.max(vonIdx, monatsIndex(posten.ab))
  const ende = posten.bis ? Math.min(bisIdx, monatsIndex(posten.bis)) : bisIdx
  return Math.max(0, ende - start + 1)
}

function laeuftNoch(posten, heuteIdx) {
  return monatsIndex(posten.ab) <= heuteIdx && (!posten.bis || monatsIndex(posten.bis) >= heuteIdx)
}

function summe(werte) {
  return werte.reduce((acc, wert) => acc + wert, 0)
}

// Hochrechnung pro Jahr: laufende Posten plus Durchschnitt der einmaligen Quartalskosten aufs Jahr.
function kostenProJahrCents(posten, quartale, heute) {
  const heuteIdx = monatsIndex(heute)
  const laufend = summe(posten.filter((p) => laeuftNoch(p, heuteIdx)).map((p) => monatsrateCents(p) * MONATE_JE_JAHR))
  const einmalig = quartale.length ? (summe(quartale.map((q) => q.kostenCents || 0)) / quartale.length) * QUARTALE_JE_JAHR : 0
  return Math.round(laufend + einmalig)
}

// Kosten bis heute: alle einmaligen Quartalskosten plus die bisher angefallenen Monatsraten.
function kostenBisherCents(posten, quartale, heute) {
  const heuteIdx = monatsIndex(heute)
  const laufend = summe(posten.map((p) => monatsrateCents(p) * monateAktiv(p, -Infinity, heuteIdx)))
  return Math.round(laufend + summe(quartale.map((q) => q.kostenCents || 0)))
}

// Kosten eines Quartals: einmalige plus die Monatsraten der drei Monate darin.
function quartalKostenCents(posten, quartal) {
  const vonIdx = quartal.jahr * MONATE_JE_JAHR + (quartal.quartal - 1) * MONATE_JE_QUARTAL
  const bisIdx = vonIdx + MONATE_JE_QUARTAL - 1
  return Math.round((quartal.kostenCents || 0) + summe(posten.map((p) => monatsrateCents(p) * monateAktiv(p, vonIdx, bisIdx))))
}

// Was bis Jahresende noch anfällt: die Monatsraten der Monate nach dem heutigen bis Dezember.
function restKostenJahrCents(posten, heute) {
  const heuteIdx = monatsIndex(heute)
  const dezemberIdx = heute.getFullYear() * MONATE_JE_JAHR + (MONATE_JE_JAHR - 1)
  if (heuteIdx >= dezemberIdx) return 0
  return Math.round(summe(posten.map((p) => monatsrateCents(p) * monateAktiv(p, heuteIdx + 1, dezemberIdx))))
}

// --- Die ganze Rechnung ------------------------------------------------------------------------------------------------

function chronologisch(quartale) {
  return quartale.slice().sort((a, b) => a.jahr - b.jahr || a.quartal - b.quartal)
}

// Verteilung je Quartal (chronologisch) mit Übertrag der Rücklage; liefert die Zeilen und den Stand danach.
function berechneVerteilung(quartale, posten, jahresKosten) {
  let ruecklage = 0
  const zeilen = chronologisch(quartale).map((quartal) => {
    const kostenCents = quartalKostenCents(posten, quartal)
    const verteilung = verteileUeberschuss({ spendenCents: quartal.einnahmenSpendenCents, kostenCents, ruecklageCents: ruecklage, kostenProJahrCents: jahresKosten })
    const entnahmeCents = quartal.reserveEntnahmeCents || 0
    ruecklage = Math.max(0, ruecklage + verteilung.reserveCents - entnahmeCents)
    return { jahr: quartal.jahr, quartal: quartal.quartal, kostenCents, ...verteilung, entnahmeCents, ruecklageDanachCents: ruecklage }
  })
  return { zeilen, ruecklageCents: ruecklage }
}

function rundeJahre(jahre) {
  return jahre === null ? null : Math.round(jahre * 10) / 10
}

// quartale: öffentliche Form (camelCase, beliebige Reihenfolge); posten: laufende Kosten (camelCase); heute: Date.
function berechneFinanzen({ quartale, posten, heute = new Date() }) {
  const jahresKosten = kostenProJahrCents(posten, quartale, heute)
  const spendenBisher = summe(quartale.map((q) => q.einnahmenSpendenCents || 0))
  const kostenBisher = kostenBisherCents(posten, quartale, heute)
  const rest = restKostenJahrCents(posten, heute)
  const { zeilen, ruecklageCents } = berechneVerteilung(quartale, posten, jahresKosten)
  return {
    kostenProJahrCents: jahresKosten,
    kostenBisherCents: kostenBisher,
    spendenBisherCents: spendenBisher,
    saldoCents: spendenBisher - kostenBisher,
    restKostenJahrCents: rest,
    prognoseJahresendeCents: spendenBisher - kostenBisher - rest,
    ruecklage: {
      centsAktuell: ruecklageCents,
      jahreGedeckt: rundeJahre(ruecklageJahre(ruecklageCents, jahresKosten)),
      anteilProzent: ruecklageAnteilProzent(ruecklageCents, jahresKosten)
    },
    verteilung: zeilen
  }
}

module.exports = {
  RUECKLAGE_STUFEN,
  ruecklageJahre,
  ruecklageAnteilProzent,
  verteileUeberschuss,
  monatsrateCents,
  kostenProJahrCents,
  kostenBisherCents,
  quartalKostenCents,
  restKostenJahrCents,
  berechneFinanzen
}
