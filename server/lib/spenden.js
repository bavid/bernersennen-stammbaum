'use strict'

// „Spenden live“: jede eingegangene Spende als eigene Zeile (Tabelle spenden_eingaenge, legt dieses Modul selbst an -
// db.js ist an seiner Dateigrenze). Heute trägt der Admin sie ein (routes/adminSpenden.js), später zusätzlich ein
// Zahlungsanbieter über den vorbereiteten Webhook (lib/spendenWebhook.js). Beträge in ganzen Cent wie überall.
//
// Modell (bewusst einfach, Plan docs/superpowers/plans/2026-10-11-spenden-live.md): Für jedes Quartal, in dem es mindestens
// EINE echte erfasste Spende gibt (is_demo = 0), ist die Summe dieser Spenden die Spenden-Einnahme des Quartals - der von
// Hand eingetragene Wert finanzierung_quartale.einnahmen_spenden_cents gilt dann nicht mehr. Quartale ohne erfasste Spenden
// behalten den Handwert (Zeit vor „Spenden live“). Gibt es zu einem Quartal mit Spenden noch keine Quartalszeile, entsteht
// sie in der Rechnung mit 0 für alles andere. So gibt es genau eine Quelle je Quartal und nichts wird doppelt gezählt.
// Demo-Spenden (is_demo = 1) zählen nie in Quartale, Rechnung oder Laufband; nur die Live-Anzeige darf sie zeigen, wenn es
// keine echten gibt (lib/spendenLive.js) - nie gemischt.
//
// Öffentlich: Betrag immer (Summen), Name und Nachricht nur, wenn oeffentlich = 1 und der Spender sie angegeben hat.

const db = require('../db')
const { httpError, assertKnownFields, cleanText, cleanCents, cleanIsoDate } = require('./finanzierungFelder')

db.exec(`
  CREATE TABLE IF NOT EXISTS spenden_eingaenge (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    betrag_cents INTEGER NOT NULL CHECK (betrag_cents > 0),
    datum TEXT NOT NULL,
    quelle TEXT NOT NULL CHECK (quelle IN ('gofundme','paypal','ueberweisung','bar','sonstiges')),
    anzeigename TEXT,
    nachricht TEXT,
    oeffentlich INTEGER NOT NULL DEFAULT 1 CHECK (oeffentlich IN (0, 1)),
    is_demo INTEGER NOT NULL DEFAULT 0,
    extern_ref TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_spenden_eingaenge_datum ON spenden_eingaenge (is_demo, datum);
`)

const QUELLEN = Object.freeze(['gofundme', 'paypal', 'ueberweisung', 'bar', 'sonstiges'])
const SPENDE_LIMITS = Object.freeze({ anzeigename: 40, nachricht: 140 })
const SPENDE_FIELDS = Object.freeze(['betragCents', 'datum', 'quelle', 'anzeigename', 'nachricht', 'oeffentlich'])
const ADMIN_LIST_LIMIT = 200

function heuteIso(now = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function cleanQuelle(value) {
  if (!QUELLEN.includes(value)) throw httpError(400, 'Bitte eine Quelle wählen.', 'quelle')
  return value
}

// vorgabe: was gilt, wenn das Feld fehlt - Admin-Formular 1 (schickt es ohnehin immer mit), Webhook 0 (nur ein
// ausdrückliches true des Anbieters macht Name und Nachricht öffentlich).
function cleanOeffentlich(value, vorgabe = 1) {
  if (value === undefined || value === null) return vorgabe
  if (typeof value !== 'boolean') throw httpError(400, '„Öffentlich“ muss ja oder nein sein.', 'oeffentlich')
  return value ? 1 : 0
}

// Eine Spende als Spalten (snake_case). Datum Vorgabe heute, nie in der Zukunft (ein Tag Spielraum für Zeitzonen).
function validateSpende(body, now = new Date(), { oeffentlichVorgabe = 1 } = {}) {
  assertKnownFields(body, SPENDE_FIELDS)
  const datum = cleanIsoDate(body.datum, { feld: 'datum', label: 'Das Datum' }) || heuteIso(now)
  const morgen = heuteIso(new Date(now.getTime() + 24 * 60 * 60 * 1000))
  if (datum > morgen) throw httpError(400, 'Das Datum darf nicht in der Zukunft liegen.', 'datum')
  return {
    betrag_cents: cleanCents(body.betragCents, { feld: 'betragCents', label: 'Der Betrag', required: true, min: 1 }),
    datum,
    quelle: cleanQuelle(body.quelle),
    anzeigename: cleanText(body.anzeigename, { feld: 'anzeigename', label: 'Der Name', max: SPENDE_LIMITS.anzeigename }) || null,
    nachricht: cleanText(body.nachricht, { feld: 'nachricht', label: 'Die Nachricht', max: SPENDE_LIMITS.nachricht }) || null,
    oeffentlich: cleanOeffentlich(body.oeffentlich, oeffentlichVorgabe)
  }
}

const listStmt = db.prepare('SELECT * FROM spenden_eingaenge ORDER BY datum DESC, id DESC LIMIT ?')
const findStmt = db.prepare('SELECT * FROM spenden_eingaenge WHERE id = ?')
const findExternStmt = db.prepare('SELECT * FROM spenden_eingaenge WHERE extern_ref = ?')
const insertStmt = db.prepare(`
  INSERT INTO spenden_eingaenge (betrag_cents, datum, quelle, anzeigename, nachricht, oeffentlich, is_demo, extern_ref)
  VALUES (@betrag_cents, @datum, @quelle, @anzeigename, @nachricht, @oeffentlich, @is_demo, @extern_ref)`)
const updateStmt = db.prepare(`
  UPDATE spenden_eingaenge
  SET betrag_cents = @betrag_cents, datum = @datum, quelle = @quelle, anzeigename = @anzeigename, nachricht = @nachricht,
      oeffentlich = @oeffentlich
  WHERE id = @id`)
const deleteStmt = db.prepare('DELETE FROM spenden_eingaenge WHERE id = ?')
const quartalSummenStmt = db.prepare(`
  SELECT CAST(substr(datum, 1, 4) AS INTEGER) AS jahr, (CAST(substr(datum, 6, 2) AS INTEGER) + 2) / 3 AS quartal,
         SUM(betrag_cents) AS cents
  FROM spenden_eingaenge WHERE is_demo = 0 GROUP BY jahr, quartal`)

function adminSpende(row) {
  return {
    id: row.id,
    betragCents: row.betrag_cents,
    datum: row.datum,
    quelle: row.quelle,
    anzeigename: row.anzeigename,
    nachricht: row.nachricht,
    oeffentlich: row.oeffentlich === 1,
    isDemo: row.is_demo === 1,
    extern: Boolean(row.extern_ref),
    createdAt: row.created_at
  }
}

function listSpenden() {
  return listStmt.all(ADMIN_LIST_LIMIT).map(adminSpende)
}

// isDemo/externRef/oeffentlichVorgabe nur intern (Demo-Paket, Webhook) - nie aus einem Formular.
function createSpende(body, { isDemo = false, externRef = null, now, oeffentlichVorgabe = 1 } = {}) {
  const row = validateSpende(body, now, { oeffentlichVorgabe })
  const id = insertStmt.run({ ...row, is_demo: isDemo ? 1 : 0, extern_ref: externRef }).lastInsertRowid
  return adminSpende(findStmt.get(id))
}

function findSpendeByExternRef(externRef) {
  const row = findExternStmt.get(externRef)
  return row ? adminSpende(row) : null
}

// null, wenn es die Id nicht gibt.
function updateSpende(id, body) {
  if (!findStmt.get(id)) return null
  updateStmt.run({ ...validateSpende(body), id })
  return adminSpende(findStmt.get(id))
}

function deleteSpende(id) {
  return deleteStmt.run(id).changes > 0
}

// Quartale (öffentliche Form, camelCase) mit den erfassten echten Spenden - Modell siehe Kopf. Liefert eine neue Liste.
function mitLiveSpenden(quartale) {
  const live = new Map(quartalSummenStmt.all().map((row) => [`${row.jahr}-${row.quartal}`, row.cents]))
  const merged = quartale.map((quartal) => {
    const key = `${quartal.jahr}-${quartal.quartal}`
    return live.has(key) ? { ...quartal, einnahmenSpendenCents: live.get(key) } : quartal
  })
  const vorhanden = new Set(quartale.map((quartal) => `${quartal.jahr}-${quartal.quartal}`))
  const neu = [...live.entries()]
    .filter(([key]) => !vorhanden.has(key))
    .map(([key, cents]) => {
      const [jahr, quartal] = key.split('-').map(Number)
      return {
        jahr,
        quartal,
        einnahmenSpendenCents: cents,
        einnahmenPartnerCents: 0,
        kostenCents: 0,
        spendenWeitergegebenCents: 0,
        reserveEntnahmeCents: 0,
        notiz: null
      }
    })
  return [...merged, ...neu].sort((a, b) => b.jahr - a.jahr || b.quartal - a.quartal)
}

module.exports = {
  QUELLEN,
  SPENDE_LIMITS,
  heuteIso,
  validateSpende,
  listSpenden,
  createSpende,
  findSpendeByExternRef,
  updateSpende,
  deleteSpende,
  mitLiveSpenden
}
