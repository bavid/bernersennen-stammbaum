'use strict'

// Phase F: „Überall sichtbar“ (heute kostenlos) - eine Hervorhebung, mit der ein Partner in „Entdecken“ nicht nur im
// Umkreis, sondern bei allen erscheint (docs/superpowers/specs/2026-09-27-marketing-gutscheine-partner-design.md, Phase F).
// Zwei Spalten auf partners, die dieses Modul selbst anlegt (db.js ist an seiner Dateigrenze):
// - ueberall_sichtbar (0/1): der Schalter des Partners (routes/partnerArea/profile.js).
// - ueberall_gesperrt (0/1): das Team hat die Hervorhebung ausgeschaltet (routes/adminPartnerSichtbar.js) - dann steht der
//   Schalter auf 0 und der Partner kann ihn nicht wieder einschalten (403), bis der Admin es wieder erlaubt.
// In „Entdecken“ (routes/discover.js partnerSection) hängt withUeberallSichtbar die so markierten Partner hinter die Treffer
// im Umkreis - gekennzeichnet (ueberall: true), vor „Weiter weg“, höchstens MAX_FALLBACK (die nächsten). Die Partnerliste
// (/partner) bleibt unverändert: dort geht es um die Nähe.

const db = require('../db')
const { distanceKm } = require('./geo')
const { MAX_FALLBACK, roundKm, sortByName } = require('./nearby')

const COLUMN = 'ueberall_sichtbar'
const LOCK_COLUMN = 'ueberall_gesperrt'

const GESPERRT_MESSAGE = 'Diese Hervorhebung wurde vom Team ausgeschaltet – bitte meldet euch bei uns.'

function ensureColumns() {
  const existing = new Set(db.prepare('PRAGMA table_info(partners)').all().map((column) => column.name))
  for (const column of [COLUMN, LOCK_COLUMN]) {
    if (!existing.has(column)) db.exec(`ALTER TABLE partners ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`)
  }
}
ensureColumns()

const readStmt = db.prepare(`SELECT ${COLUMN} AS an, ${LOCK_COLUMN} AS gesperrt FROM partners WHERE id = ?`)
const setAnStmt = db.prepare(`UPDATE partners SET ${COLUMN} = ? WHERE id = ?`)
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

// { an, gesperrt } eines Partners (beides false, wenn es ihn nicht gibt).
function readUeberall(partnerId) {
  const row = readStmt.get(partnerId)
  return { an: Boolean(row?.an), gesperrt: Boolean(row?.gesperrt) }
}

// Der Partner schaltet selbst; solange das Team die Hervorhebung ausgeschaltet hat -> 403. changed: ob sich etwas änderte.
function setUeberallSichtbar(partnerId, an) {
  const before = readUeberall(partnerId)
  if (before.gesperrt) throw httpError(403, GESPERRT_MESSAGE)
  if (before.an === an) return { an, changed: false }
  setAnStmt.run(an ? 1 : 0, partnerId)
  return { an, changed: true }
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
function isUeberallRow(row) {
  return Boolean(row[COLUMN]) && !row[LOCK_COLUMN]
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
  GESPERRT_MESSAGE,
  parseAn,
  parseErlaubt,
  readUeberall,
  setUeberallSichtbar,
  setUeberallErlaubt,
  withUeberallSichtbar
}
