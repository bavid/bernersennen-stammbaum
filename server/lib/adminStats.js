'use strict'

// Phase 5 Task 1: Statistik für den Admin (routes/adminStats.js GET /stats) - Einlösungen, Mundpropaganda-
// Ketten, Klicks und Partner. Alles ohne Demo-Daten (is_demo = 0 bei Bereichen, Partnern, Empfehlungen,
// Einblicken und Nachrichten; kein Demo-Stapel). Je Block feste, aggregierende Abfragen - nie eine Abfrage
// pro Zeile. Nur Bereichs-, Partner- und Stapel-Namen, nie Personen.

const db = require('../db')
const { PARTNER_AREA_ARTS_SQL } = require('./partnerAreas')
const { FREIGABE_VALUES } = require('./promotions')
const { VOUCHER_COUNTS_SQL } = require('./vouchers')

const TOP_LIMIT = 10
const KLICK_TAGE = 30
const KLICK_TAGE_KURZ = 7
// Schutz gegen eine endlose Rekursion - Zyklen sind per Datenmodell ausgeschlossen (ein Bereich entsteht
// aus genau einem Gutschein und immer NACH dem ausgebenden Bereich), aber lieber eine feste Obergrenze.
const MAX_KETTEN_TIEFE = 100

// --- Einlösungen ----------------------------------------------------------------------------------

// Zähler je Stapel (eingeloest/offen/widerrufen, "abgelaufen" zählt nirgends mit): lib/vouchers.js VOUCHER_COUNTS_SQL.

// Gutscheine ohne Demo-Anteil: kein Demo-Stapel, kein Demo-Partner, kein Demo-Bereich als Ausgeber.
// Setzt die Aliase v (vouchers) und b (voucher_batches) voraus.
const NON_DEMO_VOUCHER_SQL = `
  b.kind != 'demo'
  AND NOT EXISTS (SELECT 1 FROM partners dp WHERE dp.id = v.partner_id AND dp.is_demo = 1)
  AND NOT EXISTS (SELECT 1 FROM families df WHERE df.id = v.issued_by_family_id AND df.is_demo = 1)`

// Nur Stapel, die der Admin angelegt hat (Kundenkarten, Partner-Stapel, Partner-Zugänge): kind admin/partner
// ohne ausgebenden Bereich. Weitergabe-Stapel der Bereiche (kind 'rudel') und Übergabe-Gutscheine der
// Tierheime (kind 'partner' MIT issued_by_family_id) gehören nicht in diese Liste.
const stapelStmt = db.prepare(`
  SELECT b.id, b.label, b.zweck, b.size, ${VOUCHER_COUNTS_SQL}
  FROM voucher_batches b
  JOIN vouchers v ON v.batch_id = b.id
  WHERE b.kind IN ('admin', 'partner') AND v.issued_by_family_id IS NULL AND ${NON_DEMO_VOUCHER_SQL}
  GROUP BY b.id
  ORDER BY b.created_at DESC, b.id DESC`)

// Neue Bereiche je Partner: Zuhause, die über einen Partner-Stapel oder einen von seinem Bereich
// weitergegebenen Gutschein entstanden sind (families.partner_id, lib/vouchers.js redeemVoucher). Der
// Bereich des Partners selbst (art tierheim/partner) trägt dieselbe partner_id und zählt nicht mit.
const partnerStmt = db.prepare(`
  SELECT p.id AS partnerId, p.name, COUNT(f.id) AS neueBereiche
  FROM partners p
  LEFT JOIN families f ON f.partner_id = p.id AND f.is_demo = 0 AND f.art NOT IN (${PARTNER_AREA_ARTS_SQL})
  WHERE p.is_demo = 0
  GROUP BY p.id
  ORDER BY neueBereiche DESC, p.name COLLATE NOCASE`)

const zweckStmt = db.prepare(`
  SELECT b.zweck, COUNT(*) AS gesamt, ${VOUCHER_COUNTS_SQL}
  FROM vouchers v
  JOIN voucher_batches b ON b.id = v.batch_id
  WHERE ${NON_DEMO_VOUCHER_SQL}
  GROUP BY b.zweck
  ORDER BY b.zweck`)

// --- Mundpropaganda -------------------------------------------------------------------------------

// Eine Kante: ein Bereich (issued_by_family_id) gibt einen Gutschein weiter, aus dem ein neuer Bereich
// entsteht (redeemed_by_family_id). Übergabe-Gutscheine (dog_id) sind Tier-Übergaben, keine Weitergabe.
// Wurzeln sind Bereiche, die selbst aus keiner Kante hervorgingen; die rekursive CTE sammelt je Wurzel alle
// Nachkommen mit ihrer Tiefe. Jeder Bereich hat höchstens einen Vorgänger (er entsteht aus genau einem
// Gutschein), die Kanten bilden also einen Wald - COUNT(*) - 1 ist die Zahl der Nachkommen.
const kettenStmt = db.prepare(`
  WITH RECURSIVE
    kanten AS (
      SELECT v.issued_by_family_id AS von, v.redeemed_by_family_id AS zu
      FROM vouchers v
      JOIN families a ON a.id = v.issued_by_family_id AND a.is_demo = 0
      JOIN families z ON z.id = v.redeemed_by_family_id AND z.is_demo = 0
      WHERE v.dog_id IS NULL AND v.issued_by_family_id != v.redeemed_by_family_id
    ),
    wurzeln AS (
      SELECT DISTINCT k.von AS start FROM kanten k
      WHERE NOT EXISTS (SELECT 1 FROM kanten e WHERE e.zu = k.von)
    ),
    kette(start, knoten, tiefe) AS (
      SELECT start, start, 0 FROM wurzeln
      UNION ALL
      SELECT k.start, e.zu, k.tiefe + 1 FROM kette k JOIN kanten e ON e.von = k.knoten
      WHERE k.tiefe < ${MAX_KETTEN_TIEFE}
    )
  SELECT k.start AS startFamilyId, f.name, COUNT(*) - 1 AS nachkommen, MAX(k.tiefe) AS tiefe
  FROM kette k
  JOIN families f ON f.id = k.start
  GROUP BY k.start
  ORDER BY nachkommen DESC, k.start`)

function mundpropaganda() {
  const rows = kettenStmt.all()
  return {
    ketten: rows.length,
    maxTiefe: rows.reduce((max, row) => Math.max(max, row.tiefe), 0),
    top: rows.slice(0, TOP_LIMIT).map(({ startFamilyId, name, nachkommen }) => ({ startFamilyId, name, nachkommen }))
  }
}

// --- Klicks -----------------------------------------------------------------------------------------

// Ziele der Klickzählung (routes/redirect.js TARGET_RESOLVERS) samt Titel-Quelle. Setzt den Alias c
// (link_clicks) voraus. gofundme: target_id 0 ist der echte Link, 1 der Demo-Link.
const KLICK_JOINS_SQL = `
  LEFT JOIN promotions m ON c.target_type = 'promotion' AND m.id = c.target_id
  LEFT JOIN partners p ON c.target_type IN ('partner-website', 'partner-spende') AND p.id = c.target_id`

const NON_DEMO_KLICK_SQL = `(
  (m.id IS NOT NULL AND m.is_demo = 0)
  OR (p.id IS NOT NULL AND p.is_demo = 0)
  OR (c.target_type = 'gofundme' AND c.target_id = 0))`

const KLICK_TITEL_SQL = `COALESCE(
  m.titel,
  p.name || CASE c.target_type WHEN 'partner-spende' THEN ' – Spenden' ELSE ' – Website' END,
  CASE WHEN c.target_type = 'gofundme' THEN 'Unterstützen' END)`

// Tagesreihe der letzten KLICK_TAGE Tage inklusive heute, Tage ohne Klicks mit 0 - die Tage kommen aus einer
// rekursiven CTE, damit "heute" für Reihe und Summen aus demselben date('now') stammt (routes/redirect.js
// schreibt tag als date('now'), also UTC).
const tageStmt = db.prepare(`
  WITH RECURSIVE tage(tag) AS (
    SELECT date('now', '-${KLICK_TAGE - 1} days')
    UNION ALL
    SELECT date(tag, '+1 day') FROM tage WHERE tag < date('now')
  )
  SELECT t.tag, COALESCE((
    SELECT SUM(c.anzahl) FROM link_clicks c ${KLICK_JOINS_SQL}
    WHERE c.tag = t.tag AND ${NON_DEMO_KLICK_SQL}
  ), 0) AS anzahl
  FROM tage t
  ORDER BY t.tag`)

const topKlicksStmt = db.prepare(`
  SELECT c.target_type AS targetType, c.target_id AS targetId, ${KLICK_TITEL_SQL} AS titel,
    SUM(CASE WHEN c.tag >= date('now', '-${KLICK_TAGE_KURZ - 1} days') THEN c.anzahl ELSE 0 END) AS klicks7,
    SUM(CASE WHEN c.tag >= date('now', '-${KLICK_TAGE - 1} days') THEN c.anzahl ELSE 0 END) AS klicks30,
    SUM(c.anzahl) AS gesamt
  FROM link_clicks c ${KLICK_JOINS_SQL}
  WHERE ${NON_DEMO_KLICK_SQL}
  GROUP BY c.target_type, c.target_id
  ORDER BY klicks30 DESC, gesamt DESC, c.target_type, c.target_id
  LIMIT ${TOP_LIMIT}`)

// --- Partner ----------------------------------------------------------------------------------------

// Vier disjunkte Töpfe, die sich zur Partnerzahl summieren: gesperrt zuerst (eine Sperre setzt status zwar
// auf 'pausiert', lib/partners.js validatePartner - hier zählt sie aber nur als gesperrt), dann der Status.
const partnerStatusStmt = db.prepare(`
  SELECT
    COUNT(CASE WHEN gesperrt = 0 AND status = 'entwurf' THEN 1 END) AS entwurf,
    COUNT(CASE WHEN gesperrt = 0 AND status = 'aktiv' THEN 1 END) AS aktiv,
    COUNT(CASE WHEN gesperrt = 0 AND status = 'pausiert' THEN 1 END) AS pausiert,
    COUNT(CASE WHEN gesperrt = 1 THEN 1 END) AS gesperrt
  FROM partners WHERE is_demo = 0`)

const einblickeStmt = db.prepare(`
  SELECT COUNT(*) AS c FROM partner_einblicke e
  JOIN partners p ON p.id = e.partner_id AND p.is_demo = 0
  WHERE e.is_demo = 0`)

// Beiträge der Partner (Phase P2 Task 8: promotions mit erstellt_von_partner = 1) je Freigabe-Status.
const beitraegeStmt = db.prepare(`
  SELECT freigabe, COUNT(*) AS c FROM promotions
  WHERE erstellt_von_partner = 1 AND is_demo = 0
  GROUP BY freigabe`)

// Nur die Zahl - Inhalte der Nachrichten sind personenbezogen (lib/partnerMessages.js) und bleiben beim Partner.
const ungeleseneStmt = db.prepare(`
  SELECT COUNT(*) AS c FROM partner_messages n
  JOIN partners p ON p.id = n.partner_id AND p.is_demo = 0
  WHERE n.gelesen_at IS NULL AND n.is_demo = 0`)

function beitraegeJeFreigabe() {
  const counted = new Map(beitraegeStmt.all().map((row) => [row.freigabe, row.c]))
  return Object.fromEntries(FREIGABE_VALUES.map((freigabe) => [freigabe, counted.get(freigabe) ?? 0]))
}

function partnerBlock() {
  return {
    status: partnerStatusStmt.get(),
    einblicke: einblickeStmt.get().c,
    beitraege: beitraegeJeFreigabe(),
    ungeleseneNachrichten: ungeleseneStmt.get().c
  }
}

function collectStats() {
  return {
    einloesungen: { stapel: stapelStmt.all(), partner: partnerStmt.all(), zweck: zweckStmt.all() },
    mundpropaganda: mundpropaganda(),
    klicks: { tage: tageStmt.all(), top: topKlicksStmt.all() },
    partner: partnerBlock()
  }
}

module.exports = { collectStats }
