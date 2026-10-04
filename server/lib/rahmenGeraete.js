'use strict'

// Digitaler Bilderrahmen auf einem anderen Gerät (z. B. Omas Tablet), ohne Anmeldung: ein Zuhause legt einen Rahmen-Link
// an (Einstellungen › Mein Zuhause), der Link /rahmen#TOKEN trägt ein zufälliges Token (256 Bit). Gespeichert wird nur
// dessen HMAC (eigener, aus CODE_PEPPER abgeleiteter Schlüssel) - das Token selbst sieht man genau einmal, beim Anlegen.
// Ein Rahmen gilt nur, solange das Zuhause besteht, kein Demo ist und seinen Schlüssel nicht erneuert hat (auth_epoch:
// wer den Schlüssel wegen eines Verdachts erneuert, beendet damit auch alle Rahmen-Links). Widerrufen löscht die Zeile -
// sofort ungültig, auch für schon ausgegebene Foto-Adressen (routes/rahmen.js prüft das Gerät bei jedem Foto).
// Die Tabelle legt dieses Modul selbst an (wie lib/visitenkarte.js) - db.js ist an seiner Dateigrenze.

const crypto = require('node:crypto')
const db = require('../db')
const { codePepper } = require('../config')
const { cleanText } = require('./validate')
const { isZeitraum } = require('./bilderrahmen')

db.exec(`
  CREATE TABLE IF NOT EXISTS rahmen_geraete (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    auth_epoch INTEGER NOT NULL DEFAULT 0,
    auswahl TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_rahmen_geraete_family ON rahmen_geraete(family_id);
`)

const MAX_GERAETE = 5
const MAX_NAME_LENGTH = 40
const MAX_TIERE = 50
const TOKEN_BYTES = 32
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
const INTERVALLE = [5, 10, 30, 60]

const DEFAULT_AUSWAHL = Object.freeze({
  tiere: [],
  zeitraum: 'alle',
  privat: false,
  intervall: 10,
  untertitel: true,
  uhr: false,
  nacht: true,
  mischen: true,
  heuteZuerst: true,
  erinnerung: true
})
const SWITCHES = ['privat', 'untertitel', 'uhr', 'nacht', 'mischen', 'heuteZuerst', 'erinnerung']

const tokenKey = crypto.createHash('sha256').update(`${codePepper}:rahmen-token`).digest()

function hashToken(token) {
  return crypto.createHmac('sha256', tokenKey).update(token).digest('hex')
}

function badRequest(message, status = 400) {
  return Object.assign(new Error(message), { status })
}

const ownDogIdsStmt = db.prepare('SELECT id FROM dogs WHERE family_id = ?').pluck()

function cleanTiere(value, homeId) {
  if (!Array.isArray(value) || value.length > MAX_TIERE || !value.every((id) => Number.isInteger(id) && id > 0)) {
    throw badRequest('Ungültige Auswahl der Tiere')
  }
  const own = new Set(ownDogIdsStmt.all(homeId))
  const ids = [...new Set(value)]
  if (!ids.every((id) => own.has(id))) throw badRequest('Nur eigene Tiere können in einen Bilderrahmen')
  return ids
}

// Prüft die Auswahl (Tiere, Zeitraum, Anzeige) - fehlende Felder kommen aus base (beim Anlegen die Vorgabe, beim
// Ändern die gespeicherte Auswahl). Unbekannte Felder fallen weg.
function cleanAuswahl(input, homeId, base = DEFAULT_AUSWAHL) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const has = (key) => Object.prototype.hasOwnProperty.call(source, key)
  const auswahl = { ...DEFAULT_AUSWAHL, ...base }
  if (has('tiere')) auswahl.tiere = cleanTiere(source.tiere, homeId)
  if (has('zeitraum')) {
    if (!isZeitraum(source.zeitraum)) throw badRequest('Ungültiger Zeitraum')
    auswahl.zeitraum = source.zeitraum
  }
  if (has('intervall')) {
    if (!INTERVALLE.includes(source.intervall)) throw badRequest('Ungültiger Wechsel-Abstand')
    auswahl.intervall = source.intervall
  }
  for (const key of SWITCHES) {
    if (!has(key)) continue
    if (typeof source[key] !== 'boolean') throw badRequest('Ungültige Einstellung')
    auswahl[key] = source[key]
  }
  return auswahl
}

function cleanName(value) {
  if (typeof value !== 'string') throw badRequest('Bitte gebt dem Bilderrahmen einen Namen, z. B. „Wohnzimmer Oma“')
  const name = cleanText(value, MAX_NAME_LENGTH + 1)
  if (!name) throw badRequest('Bitte gebt dem Bilderrahmen einen Namen, z. B. „Wohnzimmer Oma“')
  if (name.length > MAX_NAME_LENGTH) throw badRequest(`Der Name darf höchstens ${MAX_NAME_LENGTH} Zeichen haben`)
  return name
}

function parseAuswahl(json) {
  try {
    const parsed = JSON.parse(json)
    return { ...DEFAULT_AUSWAHL, ...(parsed && typeof parsed === 'object' ? parsed : {}) }
  } catch {
    return { ...DEFAULT_AUSWAHL }
  }
}

function toGeraet(row) {
  return { id: row.id, name: row.name, auswahl: parseAuswahl(row.auswahl), erstellt: row.created_at, zuletztAktiv: row.last_seen_at }
}

const familyStmt = db.prepare('SELECT id, art, is_demo, auth_epoch FROM families WHERE id = ?')
const countStmt = db.prepare(
  'SELECT COUNT(*) AS c FROM rahmen_geraete g JOIN families f ON f.id = g.family_id WHERE g.family_id = ? AND g.auth_epoch = f.auth_epoch'
)
const insertStmt = db.prepare(
  'INSERT INTO rahmen_geraete (family_id, name, token_hash, auth_epoch, auswahl) VALUES (@familyId, @name, @tokenHash, @authEpoch, @auswahl)'
)
const listStmt = db.prepare(
  `SELECT g.* FROM rahmen_geraete g JOIN families f ON f.id = g.family_id
   WHERE g.family_id = ? AND g.auth_epoch = f.auth_epoch ORDER BY g.created_at, g.id`
)
const findOwnStmt = db.prepare(
  `SELECT g.* FROM rahmen_geraete g JOIN families f ON f.id = g.family_id
   WHERE g.id = ? AND g.family_id = ? AND g.auth_epoch = f.auth_epoch`
)
const updateStmt = db.prepare('UPDATE rahmen_geraete SET name = @name, auswahl = @auswahl WHERE id = @id AND family_id = @familyId')
const deleteStmt = db.prepare('DELETE FROM rahmen_geraete WHERE id = ? AND family_id = ?')
// Abgelaufene Epochen (Schlüssel erneuert) räumen wir beim nächsten Anlegen weg - die Liste filtert sie ohnehin aus (und
// bleibt so ein reines Lesen, auch in Demo und Admin-Ansicht).
const purgeStaleStmt = db.prepare(
  'DELETE FROM rahmen_geraete WHERE family_id = @familyId AND auth_epoch != (SELECT auth_epoch FROM families WHERE id = @familyId)'
)
// Gilt das Gerät noch? Zuhause besteht, ist kein Demo, Schlüssel nicht erneuert.
const ACTIVE_SQL = `SELECT g.id, g.family_id, g.name, g.auswahl FROM rahmen_geraete g
   JOIN families f ON f.id = g.family_id AND f.art = 'zuhause' AND f.is_demo = 0 AND f.auth_epoch = g.auth_epoch`
const byTokenStmt = db.prepare(`${ACTIVE_SQL} WHERE g.token_hash = ?`)
const byIdStmt = db.prepare(`${ACTIVE_SQL} WHERE g.id = ?`)
// „zuletzt aktiv“ höchstens alle fünf Minuten schreiben - der Rahmen fragt regelmäßig nach.
const touchStmt = db.prepare(
  "UPDATE rahmen_geraete SET last_seen_at = datetime('now') WHERE id = ? AND (last_seen_at IS NULL OR last_seen_at < datetime('now', '-5 minutes'))"
)

const createTransaction = db.transaction((homeId, values) => {
  purgeStaleStmt.run({ familyId: homeId })
  if (countStmt.get(homeId).c >= MAX_GERAETE) {
    throw badRequest(`Höchstens ${MAX_GERAETE} Bilderrahmen je Zuhause – beendet zuerst einen anderen.`, 409)
  }
  return insertStmt.run(values).lastInsertRowid
})

// Neues Gerät für das Zuhause homeId: { geraet, token } - das Token gibt es nur hier.
function createGeraet(homeId, input = {}) {
  const family = familyStmt.get(homeId)
  if (!family || family.art !== 'zuhause' || family.is_demo) throw badRequest('Bilderrahmen-Links gibt es nur für das eigene Zuhause')
  const name = cleanName(input.name)
  const auswahl = cleanAuswahl(input.auswahl, homeId)
  const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url')
  const id = createTransaction(homeId, {
    familyId: homeId,
    name,
    tokenHash: hashToken(token),
    authEpoch: family.auth_epoch,
    auswahl: JSON.stringify(auswahl)
  })
  return { geraet: toGeraet(findOwnStmt.get(id, homeId)), token }
}

function listGeraete(homeId) {
  return listStmt.all(homeId).map(toGeraet)
}

// Name und/oder Auswahl ändern; null, wenn es das Gerät (für dieses Zuhause) nicht gibt.
function updateGeraet(homeId, id, input = {}) {
  const row = findOwnStmt.get(id, homeId)
  if (!row) return null
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key)
  if (!has('name') && !has('auswahl')) throw badRequest('Nichts zu ändern')
  const name = has('name') ? cleanName(input.name) : row.name
  const auswahl = has('auswahl') ? cleanAuswahl(input.auswahl, homeId, parseAuswahl(row.auswahl)) : parseAuswahl(row.auswahl)
  updateStmt.run({ id, familyId: homeId, name, auswahl: JSON.stringify(auswahl) })
  return toGeraet(findOwnStmt.get(id, homeId))
}

function revokeGeraet(homeId, id) {
  return deleteStmt.run(id, homeId).changes === 1
}

function toActive(row) {
  return row ? { id: row.id, familyId: row.family_id, name: row.name, auswahl: parseAuswahl(row.auswahl) } : null
}

// Das Gerät zu einem Token aus dem Header - null für jedes unbekannte, widerrufene oder ungültig geformte Token.
function findGeraetByToken(token) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return null
  return toActive(byTokenStmt.get(hashToken(token)))
}

function findActiveGeraet(id) {
  return toActive(byIdStmt.get(id))
}

function touchGeraet(id) {
  touchStmt.run(id)
}

module.exports = {
  MAX_GERAETE,
  DEFAULT_AUSWAHL,
  hashToken,
  createGeraet,
  listGeraete,
  updateGeraet,
  revokeGeraet,
  findGeraetByToken,
  findActiveGeraet,
  touchGeraet
}
