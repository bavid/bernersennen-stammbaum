'use strict'

// Plan 2027, Kapitel 8 „Woran wir Erfolg messen“: drei Kennzahlen für den Admin (routes/adminStats.js
// GET /stats/kpi?zeitraum=30|90|alle). Alles aus eigenen Tabellen, kein Tracking, ohne Demo-Daten, ohne Personen -
// nur Zahlen und Stapel-/Partner-Namen.
//
// 1. Einlösungen je Code-Serie/Kanal: Admin-Stapel (wie lib/adminStats.js „Code-Stapel“) mit ausgegeben, eingelöst
//    gesamt, eingelöst im Zeitraum und Quote; gruppiert nach Serie (Präfix der Bezeichnung, z. B. „FB-…“) oder Partner.
// 2. Aktivierung: Anteil neuer Zuhause mit einer ersten Erinnerung binnen 7 Tagen nach dem Anlegen.
// 3. Wiederkommen: Anteil der Zuhause, die in ihrer Woche 4 (Tag 21 bis unter 28) aktiv waren.
//
// Kohorten: Ein Zuhause zählt erst, wenn sein Messfenster vorbei ist, und zwar in dem Zeitraum, in dem das Fenster
// ENDETE (Aktivierung: angelegt vor 7 bis 7+N Tagen; Wiederkommen: vor 28 bis 28+N Tagen). So misst „30 Tage“ auch
// bei Wiederkommen echte Fälle statt nur der zwei Tage alten Rand-Kohorte, und junge Zuhause drücken keine Quote.

const db = require('../db')
const { NON_DEMO_VOUCHER_SQL } = require('./adminStats')

const ZEITRAEUME = { 30: 30, 90: 90, alle: null }
const DEFAULT_ZEITRAUM = '30'
const AKTIVIERUNG_TAGE = 7
const WOCHE4_VON = 21
const WOCHE4_BIS = 28
// Zielwerte aus dem Plan 2027 (Prozent) - der Client zeigt daran „ok“ oder „wartet“.
const ZIEL = { aktivierung: 50, wiederkommen: 25 }
const SERIE_PATTERN = /^([A-Za-z0-9]{1,8})-/

// @mod: SQLite-Modifier wie '-30 days' oder NULL (alle). Ein Zeitpunkt t liegt im Zeitraum, wenn
// @mod NULL ist oder t >= datetime('now', @mod).
const IM_ZEITRAUM = (spalte) => `(@mod IS NULL OR ${spalte} >= datetime('now', @mod))`

const stapelStmt = db.prepare(`
  SELECT b.id, b.label, p.name AS partnerName,
    COUNT(CASE WHEN v.revoked_at IS NULL THEN 1 END) AS ausgegeben,
    COUNT(CASE WHEN v.revoked_at IS NULL AND v.redeemed_at IS NOT NULL THEN 1 END) AS eingeloestGesamt,
    COUNT(CASE WHEN v.revoked_at IS NULL AND v.redeemed_at IS NOT NULL AND ${IM_ZEITRAUM('v.redeemed_at')} THEN 1 END)
      AS eingeloest
  FROM voucher_batches b
  JOIN vouchers v ON v.batch_id = b.id
  LEFT JOIN partners p ON p.id = b.partner_id AND p.is_demo = 0
  WHERE b.kind IN ('admin', 'partner') AND v.issued_by_family_id IS NULL AND ${NON_DEMO_VOUCHER_SQL}
  GROUP BY b.id
  HAVING ${IM_ZEITRAUM('b.created_at')} OR eingeloest > 0
  ORDER BY b.created_at DESC, b.id DESC`)

// Neue echte Zuhause, deren Fenster von `tage` Tagen im Zeitraum endete (siehe Kohorten oben).
const KOHORTE_SQL = (tage) => `
  f.art = 'zuhause' AND f.is_demo = 0
  AND f.created_at <= datetime('now', '-${tage} days')
  AND (@mod IS NULL OR f.created_at >= datetime(datetime('now', @mod), '-${tage} days'))`

// Tage seit dem Anlegen des Zuhause f bis zum Zeitpunkt `spalte`.
const ALTER_SQL = (spalte) => `(julianday(${spalte}) - julianday(f.created_at))`

const aktivierungStmt = db.prepare(`
  SELECT COUNT(*) AS kohorte,
    COUNT(CASE WHEN EXISTS (
      SELECT 1 FROM timeline_entries te
      WHERE te.family_id = f.id AND ${ALTER_SQL('te.created_at')} < ${AKTIVIERUNG_TAGE}
    ) THEN 1 END) AS erreicht
  FROM families f
  WHERE ${KOHORTE_SQL(AKTIVIERUNG_TAGE)}`)

// Es gibt keinen „zuletzt aktiv“-Zeitstempel (bewusst: kein Tracking von Anmeldungen oder Seitenaufrufen). Als
// Aktivität in Woche 4 zählen deshalb nur Spuren, die das Zuhause selbst in eigenen Tabellen hinterlässt:
//   - eine neue Erinnerung (timeline_entries.family_id),
//   - ein Gruß/Kommentar (entry_comments.family_id),
//   - eine Besuchs-Einladung („Mit dabei“ setzt eine Verbindung voraus: vouchers.visit_host_family_id, created_at),
//   - ein weitergegebener Einladungscode, der eingelöst wurde (vouchers.issued_by_family_id, redeemed_at) -
//     das Anlegen der Weitergabe-Codes selbst zählt nicht, das passiert automatisch (lib/vouchers.js ensureVoucherQuota),
//   - eine „Mit dabei“-Markierung an einer eigenen Erinnerung (erlebt_mit.created_at).
const WOCHE4_SQL = (spalte) => `${ALTER_SQL(spalte)} >= ${WOCHE4_VON} AND ${ALTER_SQL(spalte)} < ${WOCHE4_BIS}`

const wiederkommenStmt = db.prepare(`
  SELECT COUNT(*) AS kohorte,
    COUNT(CASE WHEN
      EXISTS (SELECT 1 FROM timeline_entries te WHERE te.family_id = f.id AND ${WOCHE4_SQL('te.created_at')})
      OR EXISTS (SELECT 1 FROM entry_comments c WHERE c.family_id = f.id AND ${WOCHE4_SQL('c.created_at')})
      OR EXISTS (SELECT 1 FROM vouchers vb WHERE vb.visit_host_family_id = f.id AND ${WOCHE4_SQL('vb.created_at')})
      OR EXISTS (SELECT 1 FROM vouchers vw WHERE vw.issued_by_family_id = f.id AND vw.dog_id IS NULL
                   AND vw.redeemed_at IS NOT NULL AND ${WOCHE4_SQL('vw.redeemed_at')})
      OR EXISTS (SELECT 1 FROM erlebt_mit em JOIN timeline_entries et ON et.id = em.entry_id
                   WHERE et.family_id = f.id AND ${WOCHE4_SQL('em.created_at')})
    THEN 1 END) AS erreicht
  FROM families f
  WHERE ${KOHORTE_SQL(WOCHE4_BIS)}`)

function parseZeitraum(value) {
  const key = value === undefined || value === '' ? DEFAULT_ZEITRAUM : String(value)
  if (!Object.prototype.hasOwnProperty.call(ZEITRAEUME, key)) {
    const err = new Error('Unbekannter Zeitraum')
    err.status = 400
    throw err
  }
  return key
}

function prozent(teil, ganzes) {
  return ganzes > 0 ? Math.round((teil / ganzes) * 1000) / 10 : null
}

// Serie aus der Bezeichnung („FB-Frühjahr“ -> „FB“), sonst der Partner des Stapels, sonst null („ohne Serie“).
function kanalOf({ label, partnerName }) {
  const match = SERIE_PATTERN.exec(String(label ?? ''))
  if (match) return match[1].toUpperCase()
  return partnerName || null
}

function kanaeleOf(stapel) {
  const groups = new Map()
  for (const row of stapel) {
    const prev = groups.get(row.kanal) ?? { kanal: row.kanal, stapel: 0, ausgegeben: 0, eingeloestGesamt: 0, eingeloest: 0 }
    groups.set(row.kanal, {
      ...prev,
      stapel: prev.stapel + 1,
      ausgegeben: prev.ausgegeben + row.ausgegeben,
      eingeloestGesamt: prev.eingeloestGesamt + row.eingeloestGesamt,
      eingeloest: prev.eingeloest + row.eingeloest
    })
  }
  return [...groups.values()]
    .map((row) => ({ ...row, quote: prozent(row.eingeloestGesamt, row.ausgegeben) }))
    .sort((a, b) => b.eingeloest - a.eingeloest || b.eingeloestGesamt - a.eingeloestGesamt)
}

function quoteOf({ kohorte, erreicht }) {
  return { kohorte, erreicht, quote: prozent(erreicht, kohorte) }
}

function collectKpi(zeitraumParam) {
  const zeitraum = parseZeitraum(zeitraumParam)
  const tage = ZEITRAEUME[zeitraum]
  const params = { mod: tage === null ? null : `-${tage} days` }
  const stapel = stapelStmt.all(params).map((row) => {
    const { partnerName, ...rest } = row
    return { ...rest, kanal: kanalOf(row), quote: prozent(row.eingeloestGesamt, row.ausgegeben) }
  })
  return {
    zeitraum,
    ziel: ZIEL,
    einloesungen: { stapel, kanaele: kanaeleOf(stapel) },
    aktivierung: quoteOf(aktivierungStmt.get(params)),
    wiederkommen: quoteOf(wiederkommenStmt.get(params))
  }
}

module.exports = { collectKpi, parseZeitraum, kanalOf, ZIEL }
