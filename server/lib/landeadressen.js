'use strict'

// Plan 2027 Kap. 6 „Messen ohne Tracking“: eigene Landeadressen je Kanal (/hallo, /fb, /anzeige-herbst). Der Admin legt
// sie an (routes/adminLandeadressen.js), ein Aufruf zählt anonym und leitet in die App weiter
// (lib/landeadresseWeiterleitung.js). Gezählt wird wie bei link_clicks (routes/redirect.js) nur eine Zahl je Adresse und
// Tag - keine IP, kein Cookie, kein User-Agent. Die Tabellen legt dieses Modul selbst an (db.js ist an seiner Grenze).

const db = require('../db')
const { NON_DEMO_VOUCHER_SQL } = require('./adminStats')
const { httpError, cleanSlug, cleanZiel, cleanSerie } = require('./landeadressenRegeln')

const TAGE_KURZ = 30
const MAX_LANDEADRESSEN = 100

db.exec(`
  CREATE TABLE IF NOT EXISTS landeadressen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    ziel TEXT NOT NULL DEFAULT '/',
    serie TEXT,
    aktiv INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS landeadresse_besuche (
    landeadresse_id INTEGER NOT NULL,
    tag TEXT NOT NULL,
    anzahl INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (landeadresse_id, tag)
  );
`)

const findBySlugStmt = db.prepare('SELECT id, slug, ziel FROM landeadressen WHERE slug = ? AND aktiv = 1')
const findStmt = db.prepare('SELECT * FROM landeadressen WHERE id = ?')
const slugTakenStmt = db.prepare('SELECT 1 FROM landeadressen WHERE slug = ?')
const countStmt = db.prepare('SELECT COUNT(*) AS n FROM landeadressen')
const insertStmt = db.prepare('INSERT INTO landeadressen (slug, ziel, serie) VALUES (?, ?, ?)')
const updateStmt = db.prepare('UPDATE landeadressen SET ziel = @ziel, serie = @serie, aktiv = @aktiv WHERE id = @id')
const besuchStmt = db.prepare(
  `INSERT INTO landeadresse_besuche (landeadresse_id, tag, anzahl) VALUES (?, date('now'), 1)
   ON CONFLICT(landeadresse_id, tag) DO UPDATE SET anzahl = anzahl + 1`
)

const listStmt = db.prepare(`
  SELECT l.id, l.slug, l.ziel, l.serie, l.aktiv, l.created_at,
    COALESCE(SUM(CASE WHEN b.tag >= date('now', '-${TAGE_KURZ - 1} days') THEN b.anzahl END), 0) AS besuche30,
    COALESCE(SUM(b.anzahl), 0) AS besucheGesamt
  FROM landeadressen l
  LEFT JOIN landeadresse_besuche b ON b.landeadresse_id = l.id
  GROUP BY l.id
  ORDER BY l.aktiv DESC, l.created_at DESC, l.id DESC`)

// Eingelöste Einladungscodes der Admin-/Partner-Stapel einer Serie (Bezeichnung „FB-…“, wie lib/adminKpi.js kanalOf).
const serieStmt = db.prepare(`
  SELECT
    COUNT(CASE WHEN v.redeemed_at IS NOT NULL THEN 1 END) AS gesamt,
    COUNT(CASE WHEN v.redeemed_at >= datetime('now', '-${TAGE_KURZ} days') THEN 1 END) AS tage30
  FROM voucher_batches b
  JOIN vouchers v ON v.batch_id = b.id
  WHERE b.kind IN ('admin', 'partner') AND v.issued_by_family_id IS NULL AND v.revoked_at IS NULL
    AND upper(substr(b.label, 1, length(@serie) + 1)) = @serie || '-'
    AND ${NON_DEMO_VOUCHER_SQL}`)

function findAktiv(slug) {
  return findBySlugStmt.get(slug) ?? null
}

function zaehleBesuch(id) {
  besuchStmt.run(id)
}

function einloesungenOf(serie) {
  return serie ? serieStmt.get({ serie }) : null
}

function adminRow(row) {
  return { ...row, aktiv: row.aktiv === 1, einloesungen: einloesungenOf(row.serie) }
}

function listLandeadressen() {
  return listStmt.all().map(adminRow)
}

function findForAdmin(id) {
  return listLandeadressen().find((row) => row.id === id) ?? null
}

function createLandeadresse(input = {}) {
  const slug = cleanSlug(input.slug)
  const ziel = cleanZiel(input.ziel)
  const serie = cleanSerie(input.serie)
  if (slugTakenStmt.get(slug)) throw httpError(409, 'Diesen Kurznamen gibt es schon.', 'slug')
  if (countStmt.get().n >= MAX_LANDEADRESSEN) throw httpError(409, `Höchstens ${MAX_LANDEADRESSEN} Landeadressen.`)
  const id = Number(insertStmt.run(slug, ziel, serie).lastInsertRowid)
  return findForAdmin(id)
}

// Kurzname bleibt fest (die Zählung hängt an ihm); Ziel, Serie und aktiv lassen sich ändern - fehlende Felder bleiben.
function updateLandeadresse(id, input = {}) {
  const existing = findStmt.get(id)
  if (!existing) throw httpError(404, 'Diese Landeadresse gibt es nicht')
  if (input.aktiv !== undefined && typeof input.aktiv !== 'boolean') throw httpError(400, 'aktiv muss ja oder nein sein', 'aktiv')
  const next = {
    id,
    ziel: input.ziel === undefined ? existing.ziel : cleanZiel(input.ziel),
    serie: input.serie === undefined ? existing.serie : cleanSerie(input.serie),
    aktiv: input.aktiv === undefined ? existing.aktiv : input.aktiv ? 1 : 0
  }
  updateStmt.run(next)
  return { before: { ...existing, aktiv: existing.aktiv === 1 }, after: findForAdmin(id) }
}

module.exports = { findAktiv, zaehleBesuch, listLandeadressen, createLandeadresse, updateLandeadresse, MAX_LANDEADRESSEN }
