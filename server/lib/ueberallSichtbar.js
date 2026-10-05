'use strict'

// Phase F: „Überall sichtbar (vorerst kostenlos)“ - eine Hervorhebung, mit der ein Partner in „Entdecken“ nicht nur im
// Umkreis, sondern bei allen erscheint (docs/superpowers/specs/2026-09-27-marketing-gutscheine-partner-design.md, Phase F).
// Spalte partners.ueberall_sichtbar (0/1) - dieses Modul legt sie selbst an (db.js ist an seiner Dateigrenze). Der Partner
// schaltet sie in seinem Profil (routes/partnerArea/profile.js), der Admin kann sie ausschalten
// (routes/adminPartnerSichtbar.js). In „Entdecken“ (routes/discover.js partnerSection) hängt withUeberallSichtbar die so
// markierten Partner hinter die Treffer im Umkreis - gekennzeichnet (ueberall: true), vor „Weiter weg“. Die Partnerliste
// (/partner) bleibt unverändert: dort geht es um die Nähe.

const db = require('../db')
const { distanceKm } = require('./geo')
const { roundKm, sortByName } = require('./nearby')

const COLUMN = 'ueberall_sichtbar'

function ensureColumn() {
  const exists = db.prepare('PRAGMA table_info(partners)').all().some((column) => column.name === COLUMN)
  if (!exists) db.exec(`ALTER TABLE partners ADD COLUMN ${COLUMN} INTEGER NOT NULL DEFAULT 0`)
}
ensureColumn()

const updateStmt = db.prepare(`UPDATE partners SET ${COLUMN} = ? WHERE id = ?`)
const readStmt = db.prepare(`SELECT ${COLUMN} AS an FROM partners WHERE id = ?`)

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// { an: true|false } aus dem Body - alles andere 400.
function parseAn(body) {
  const an = body && typeof body === 'object' ? body.an : undefined
  if (typeof an !== 'boolean') throw httpError(400, '„an“ muss true oder false sein')
  return an
}

function isUeberallSichtbar(partnerId) {
  return Boolean(readStmt.get(partnerId)?.an)
}

// Setzt den Schalter; changed: ob er sich geändert hat (nur dann ein Protokoll-Eintrag des Admins).
function setUeberallSichtbar(partnerId, an) {
  const before = isUeberallSichtbar(partnerId)
  if (before === an) return { an, changed: false }
  updateStmt.run(an ? 1 : 0, partnerId)
  return { an, changed: true }
}

// Mit Koordinaten die Entfernung zum Mittelpunkt, ohne keine - sortiert: nach Entfernung, ohne Koordinaten zuletzt
// (nach Name).
function ueberallItems(rows, center) {
  const withCoords = rows.filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lon))
  const withoutCoords = sortByName(rows.filter((row) => !withCoords.includes(row)))
  const measured = withCoords
    .map((row) => ({ row, distanceKm: roundKm(distanceKm(center, { lat: row.lat, lon: row.lon })), ueberall: true }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
  return [...measured, ...withoutCoords.map((row) => ({ row, ueberall: true }))]
}

// section: Ergebnis von lib/nearby.js radiusSection; rows: alle Partner des Abschnitts (bereits nach Demo, Typ und
// Sichtbarkeit gefiltert); center: Mittelpunkt der Umkreissuche oder null (ohne PLZ steht ohnehin jeder da).
// Partner mit Schalter, die nicht im Umkreis liegen, kommen direkt hinter die Treffer im Umkreis (ueberall: true) - auch
// dann, wenn der Umkreis-Fallback sie schon unter „Weiter weg“ angehängt hätte. fallback bleibt nur wahr, wenn danach noch
// etwas unter „Weiter weg“ steht.
function withUeberallSichtbar(section, rows, center) {
  if (!center) return section
  const nearIds = new Set(section.items.filter((item) => !item.ausserhalb).map((item) => item.row.id))
  const extra = rows.filter((row) => row[COLUMN] && !nearIds.has(row.id))
  if (!extra.length) return section
  const extraIds = new Set(extra.map((row) => row.id))
  const near = section.items.filter((item) => !item.ausserhalb)
  const far = section.items.filter((item) => item.ausserhalb && !extraIds.has(item.row.id))
  return { items: [...near, ...ueberallItems(extra, center), ...far], fallback: section.fallback && far.length > 0 }
}

module.exports = { COLUMN, parseAn, isUeberallSichtbar, setUeberallSichtbar, withUeberallSichtbar }
