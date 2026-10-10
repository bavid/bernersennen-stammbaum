'use strict'

// Phase F: „Überall sichtbar“ (heute kostenlos) - eine Hervorhebung, mit der ein Partner in „Entdecken“ nicht nur im
// Umkreis, sondern bei allen erscheint (docs/superpowers/specs/2026-09-27-marketing-gutscheine-partner-design.md, Phase F).
// Zwei Spalten auf partners, die dieses Modul selbst anlegt (db.js ist an seiner Dateigrenze):
// - ueberall_sichtbar (0/1): der Schalter des Partners (routes/partnerArea/profile.js).
// - ueberall_gesperrt (0/1): das Team hat die Hervorhebung ausgeschaltet (routes/adminPartnerSichtbar.js) - dann steht der
//   Schalter auf 0 und der Partner kann ihn nicht wieder einschalten (403), bis der Admin es wieder erlaubt.
// In „Entdecken“ (routes/discover.js partnerSection) hängt withUeberallSichtbar die so markierten Partner hinter die Treffer
// im Umkreis - gekennzeichnet (ueberall: true), vor „Weiter weg“, höchstens MAX_FALLBACK (die nächsten). Im öffentlichen
// Entdecken (/partner, lib/publicEntdecken.js) stehen sie im Abschnitt „Deutschlandweit“ - unabhängig von der PLZ.
// Der Schalter ist ein Antrag: sichtbar wird er erst, wenn das Team ihn freigibt (ueberall_freigabe, decideUeberall).

const db = require('../db')
const { distanceKm } = require('./geo')
const { MAX_FALLBACK, roundKm, sortByName } = require('./nearby')
const { stripUnsafeChars } = require('./partners')

const COLUMN = 'ueberall_sichtbar'
const LOCK_COLUMN = 'ueberall_gesperrt'
// Entdecken (öffentlich): der Schalter des Partners ist ein Antrag - sichtbar wird er erst nach der Freigabe des Teams.
// ueberall_freigabe: '' (offen bzw. noch nie beantragt), 'freigegeben' oder 'abgelehnt'; ueberall_grund: Grund einer Ablehnung.
const FREIGABE_COLUMN = 'ueberall_freigabe'
const GRUND_COLUMN = 'ueberall_grund'
const FREIGABE = { offen: '', freigegeben: 'freigegeben', abgelehnt: 'abgelehnt' }
const MAX_GRUND_LENGTH = 300

const GESPERRT_MESSAGE = 'Diese Hervorhebung wurde vom Team ausgeschaltet – bitte meldet euch bei uns.'

function ensureColumns() {
  const existing = new Set(db.prepare('PRAGMA table_info(partners)').all().map((column) => column.name))
  for (const column of [COLUMN, LOCK_COLUMN]) {
    if (!existing.has(column)) db.exec(`ALTER TABLE partners ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`)
  }
  if (!existing.has(GRUND_COLUMN)) db.exec(`ALTER TABLE partners ADD COLUMN ${GRUND_COLUMN} TEXT`)
  if (!existing.has(FREIGABE_COLUMN)) {
    db.exec(`ALTER TABLE partners ADD COLUMN ${FREIGABE_COLUMN} TEXT NOT NULL DEFAULT ''`)
    // Einmalig: wer den Schalter vor der Freigabe-Pflicht schon an hatte, bleibt sichtbar (keine stille Abschaltung).
    db.exec(`UPDATE partners SET ${FREIGABE_COLUMN} = 'freigegeben' WHERE ${COLUMN} = 1 AND ${LOCK_COLUMN} = 0`)
  }
}
ensureColumns()

const readStmt = db.prepare(
  `SELECT ${COLUMN} AS an, ${LOCK_COLUMN} AS gesperrt, ${FREIGABE_COLUMN} AS freigabe, ${GRUND_COLUMN} AS grund FROM partners WHERE id = ?`
)
const setAnStmt = db.prepare(`UPDATE partners SET ${COLUMN} = ? WHERE id = ?`)
// Ein neuer Antrag nach einer Ablehnung: wieder offen, der alte Grund fällt weg.
const reopenStmt = db.prepare(`UPDATE partners SET ${FREIGABE_COLUMN} = '', ${GRUND_COLUMN} = NULL WHERE id = ? AND ${FREIGABE_COLUMN} = 'abgelehnt'`)
const approveStmt = db.prepare(`UPDATE partners SET ${FREIGABE_COLUMN} = 'freigegeben', ${GRUND_COLUMN} = NULL WHERE id = ?`)
const rejectStmt = db.prepare(`UPDATE partners SET ${COLUMN} = 0, ${FREIGABE_COLUMN} = 'abgelehnt', ${GRUND_COLUMN} = ? WHERE id = ?`)
const lockStmt = db.prepare(`UPDATE partners SET ${COLUMN} = 0, ${LOCK_COLUMN} = 1 WHERE id = ?`)
const unlockStmt = db.prepare(`UPDATE partners SET ${LOCK_COLUMN} = 0 WHERE id = ?`)

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

function readFlag(body, key) {
  const value = body && typeof body === 'object' ? body[key] : undefined
  if (typeof value !== 'boolean') throw httpError(400, `„${key}“ muss true oder false sein`)
  return value
}

// { an: true|false } aus dem Body des Partners - alles andere 400.
function parseAn(body) {
  return readFlag(body, 'an')
}

// { erlaubt: true|false } aus dem Body des Admins - alles andere 400.
function parseErlaubt(body) {
  return readFlag(body, 'erlaubt')
}

// { an, gesperrt, freigabe, grund } eines Partners (aus/offen, wenn es ihn nicht gibt).
function readUeberall(partnerId) {
  const row = readStmt.get(partnerId)
  return { an: Boolean(row?.an), gesperrt: Boolean(row?.gesperrt), freigabe: row?.freigabe || FREIGABE.offen, grund: row?.grund || null }
}

// Der Partner schaltet selbst; solange das Team die Hervorhebung ausgeschaltet hat -> 403. changed: ob sich etwas änderte.
function setUeberallSichtbar(partnerId, an) {
  const before = readUeberall(partnerId)
  if (before.gesperrt) throw httpError(403, GESPERRT_MESSAGE)
  if (before.an === an) return { an, changed: false }
  setAnStmt.run(an ? 1 : 0, partnerId)
  if (an) reopenStmt.run(partnerId)
  return { an, changed: true }
}

// { freigeben: true|false, grund? } aus dem Body des Admins - eine Ablehnung braucht einen Grund (höchstens 300 Zeichen).
function parseEntscheidung(body) {
  const freigeben = readFlag(body, 'freigeben')
  if (freigeben) return { freigeben, grund: null }
  const grund = typeof body.grund === 'string' ? stripUnsafeChars(body.grund).trim() : ''
  if (!grund) throw httpError(400, 'Bitte einen kurzen Grund für die Ablehnung angeben')
  if (grund.length > MAX_GRUND_LENGTH) throw httpError(400, `Der Grund darf höchstens ${MAX_GRUND_LENGTH} Zeichen haben`)
  return { freigeben, grund }
}

// Der Admin entscheidet über einen Antrag: freigeben macht den Partner deutschlandweit sichtbar (solange sein Schalter an
// ist), ablehnen schaltet den Schalter aus und hält den Grund fest - der Partner kann danach neu beantragen.
function decideUeberall(partnerId, { freigeben, grund }) {
  if (freigeben) approveStmt.run(partnerId)
  else rejectStmt.run(grund, partnerId)
  return readUeberall(partnerId)
}

// Der Admin: erlaubt = false schaltet aus UND sperrt (der Partner kann nicht wieder einschalten), erlaubt = true hebt die
// Sperre auf (der Schalter bleibt aus - einschalten tut der Partner). changed: ob sich die Sperre änderte.
function setUeberallErlaubt(partnerId, erlaubt) {
  const before = readUeberall(partnerId)
  if (before.gesperrt === !erlaubt) return { ...before, changed: false }
  if (erlaubt) unlockStmt.run(partnerId)
  else lockStmt.run(partnerId)
  return { ...readUeberall(partnerId), changed: true }
}

// Steht der Partner in „Entdecken“ überall? Nur mit Schalter und ohne Sperre des Teams (die Sperre nullt den Schalter
// ohnehin - hier als zweite Verteidigungslinie gegen Rohdaten).
// Seit der Freigabe-Pflicht zählt nur ein freigegebener Antrag.
function isUeberallRow(row) {
  return Boolean(row[COLUMN]) && !row[LOCK_COLUMN] && row[FREIGABE_COLUMN] === FREIGABE.freigegeben
}

// Dieselbe Regel als SQL-Bedingung (öffentliches Entdecken, lib/publicEntdecken.js).
function ueberallSql() {
  return `${COLUMN} = 1 AND ${LOCK_COLUMN} = 0 AND ${FREIGABE_COLUMN} = 'freigegeben'`
}

// Mit Koordinaten die Entfernung zum Mittelpunkt, ohne keine - sortiert nach Entfernung, ohne Koordinaten zuletzt (nach
// Name); höchstens MAX_FALLBACK Einträge (die nächsten), damit die Antwort nicht beliebig wächst.
function ueberallItems(rows, center) {
  const withCoords = rows.filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lon))
  const withoutCoords = sortByName(rows.filter((row) => !withCoords.includes(row)))
  const measured = withCoords
    .map((row) => ({ row, distanceKm: roundKm(distanceKm(center, { lat: row.lat, lon: row.lon })), ueberall: true }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
  return [...measured, ...withoutCoords.map((row) => ({ row, ueberall: true }))].slice(0, MAX_FALLBACK)
}

// section: Ergebnis von lib/nearby.js radiusSection; rows: alle Partner des Abschnitts (bereits nach Demo, Typ und
// Sichtbarkeit gefiltert); center: Mittelpunkt der Umkreissuche oder null (ohne PLZ steht ohnehin jeder da).
// Partner mit Schalter, die nicht im Umkreis liegen, kommen direkt hinter die Treffer im Umkreis (ueberall: true) - auch
// dann, wenn der Umkreis-Fallback sie schon unter „Weiter weg“ angehängt hätte. fallback bleibt nur wahr, wenn danach noch
// etwas unter „Weiter weg“ steht.
function withUeberallSichtbar(section, rows, center) {
  if (!center) return section
  const nearIds = new Set(section.items.filter((item) => !item.ausserhalb).map((item) => item.row.id))
  const extra = rows.filter((row) => isUeberallRow(row) && !nearIds.has(row.id))
  if (!extra.length) return section
  const extraIds = new Set(extra.map((row) => row.id))
  const near = section.items.filter((item) => !item.ausserhalb)
  const far = section.items.filter((item) => item.ausserhalb && !extraIds.has(item.row.id))
  return { items: [...near, ...ueberallItems(extra, center), ...far], fallback: section.fallback && far.length > 0 }
}

module.exports = {
  COLUMN,
  LOCK_COLUMN,
  FREIGABE_COLUMN,
  FREIGABE,
  MAX_GRUND_LENGTH,
  parseEntscheidung,
  decideUeberall,
  isUeberallRow,
  ueberallSql,
  GESPERRT_MESSAGE,
  parseAn,
  parseErlaubt,
  readUeberall,
  setUeberallSichtbar,
  setUeberallErlaubt,
  withUeberallSichtbar
}
