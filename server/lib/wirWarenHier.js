'use strict'

// „Wir waren hier“ (docs/superpowers/plans/2026-10-10-wir-waren-hier.md): ein Zuhause meldet sich bei einem Partner an
// (Hundeschule, Salon, Tierheim ...), zeigt dort sein Tier und heftet Erinnerungen an den Ort. Der Partner gibt jede
// Anmeldung frei (lib/wwhPins.js: auch jede angeheftete Erinnerung). Die Tabellen legt dieses Modul selbst an
// (CREATE TABLE IF NOT EXISTS beim ersten require, Muster lib/visitenkarte.js) - db.js bleibt unverändert. Kein REFERENCES
// auf partners(id) (wie partner_einblicke), aber CASCADE auf families, dogs und timeline_entries (wie erlebt_mit): wird
// eine Familie, ein Tier oder ein Eintrag gelöscht, verschwinden Anmeldung und Anheftung mit.
// wwh_kontakt (Kontaktwünsche, lib/wwhKontakt.js) steht hier, damit Rückzug und „zeige mich“ aus sie gleich mit aufräumen.

const db = require('../db')
const { publicPartnerSql } = require('./partners')
const { findHome } = require('./visits')

db.exec(`
  CREATE TABLE IF NOT EXISTS wwh_checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL,
    family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    dog_id INTEGER NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'bestaetigt', 'abgelehnt')),
    zeige_mich INTEGER NOT NULL DEFAULT 0,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    entschieden_at TEXT,
    UNIQUE (partner_id, dog_id)
  );
  CREATE INDEX IF NOT EXISTS idx_wwh_checkins_partner ON wwh_checkins(partner_id, status);
  CREATE INDEX IF NOT EXISTS idx_wwh_checkins_family ON wwh_checkins(family_id);

  CREATE TABLE IF NOT EXISTS wwh_pins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    checkin_id INTEGER NOT NULL REFERENCES wwh_checkins(id) ON DELETE CASCADE,
    entry_id INTEGER NOT NULL REFERENCES timeline_entries(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'bestaetigt', 'abgelehnt')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    entschieden_at TEXT,
    UNIQUE (checkin_id, entry_id)
  );
  CREATE INDEX IF NOT EXISTS idx_wwh_pins_entry ON wwh_pins(entry_id);

  CREATE TABLE IF NOT EXISTS wwh_kontakt (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL,
    von_family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    von_dog_id INTEGER NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
    an_family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    an_dog_id INTEGER NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'angenommen', 'abgelehnt')),
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    entschieden_at TEXT,
    UNIQUE (von_dog_id, an_dog_id)
  );
  CREATE INDEX IF NOT EXISTS idx_wwh_kontakt_an ON wwh_kontakt(an_family_id, status);

  -- Rückzugs-Protokoll: wer kurz nach einem Rückzug am selben Ort neu anmeldet, löst keinen weiteren Hinweis aus.
  CREATE TABLE IF NOT EXISTS wwh_rueckzug_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    partner_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_wwh_rueckzug_log ON wwh_rueckzug_log(family_id, partner_id, created_at);
`)

const STATUS = Object.freeze({ offen: 'offen', bestaetigt: 'bestaetigt', abgelehnt: 'abgelehnt' })
const MAX_CHECKINS_PER_HOME = 20
const RENOTIFY_QUIET_MINUTES = 10

const ONLY_HOME_MESSAGE = '„Wir waren hier“ gibt es nur in „Mein Zuhause“.'
const NO_SUCH_DOG_MESSAGE = 'Dieses Tier gibt es nicht'
const NO_SUCH_PLACE_MESSAGE = 'Diesen Ort gibt es nicht'
const NO_SUCH_CHECKIN_MESSAGE = 'Diese Anmeldung gibt es nicht'
const ALREADY_MESSAGE = 'Dieses Tier ist hier schon angemeldet'
const TOO_MANY_MESSAGE = `Ihr könnt euch an höchstens ${MAX_CHECKINS_PER_HOME} Orten anmelden – zieht eine Anmeldung zurück, um eine neue zu machen.`
const BOOLEAN_MESSAGE = 'Bitte ja oder nein angeben'

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

const ownDogStmt = db.prepare('SELECT id FROM dogs WHERE id = ? AND family_id = ?')
const visiblePartnerStmt = db.prepare(`SELECT id FROM partners WHERE id = ? AND is_demo = ? AND ${publicPartnerSql()}`)
const countByHomeStmt = db.prepare('SELECT COUNT(*) AS c FROM wwh_checkins WHERE family_id = ?').pluck()
const findExistingStmt = db.prepare('SELECT 1 FROM wwh_checkins WHERE partner_id = ? AND dog_id = ?')
const insertStmt = db.prepare(
  'INSERT INTO wwh_checkins (partner_id, family_id, dog_id, is_demo) VALUES (@partnerId, @homeId, @dogId, @isDemo)'
)
const findOwnStmt = db.prepare('SELECT id, partner_id, dog_id, zeige_mich FROM wwh_checkins WHERE id = ? AND family_id = ?')
const setZeigeStmt = db.prepare('UPDATE wwh_checkins SET zeige_mich = ? WHERE id = ?')
const declineOpenWishesToDogStmt = db.prepare(
  `UPDATE wwh_kontakt SET status = 'abgelehnt', entschieden_at = datetime('now')
   WHERE partner_id = @partnerId AND an_dog_id = @dogId AND status = 'offen'`
)
const deleteOpenWishesOfDogStmt = db.prepare(
  "DELETE FROM wwh_kontakt WHERE partner_id = @partnerId AND (von_dog_id = @dogId OR an_dog_id = @dogId) AND status = 'offen'"
)
const pruneRueckzugStmt = db.prepare(
  `DELETE FROM wwh_rueckzug_log WHERE family_id = ? AND created_at <= datetime('now', '-${RENOTIFY_QUIET_MINUTES} minutes')`
)
const logRueckzugStmt = db.prepare('INSERT INTO wwh_rueckzug_log (family_id, partner_id) VALUES (?, ?)')
const recentRueckzugStmt = db.prepare(
  `SELECT 1 FROM wwh_rueckzug_log
   WHERE family_id = ? AND partner_id = ? AND created_at > datetime('now', '-${RENOTIFY_QUIET_MINUTES} minutes') LIMIT 1`
)
const deleteCheckinStmt = db.prepare('DELETE FROM wwh_checkins WHERE id = ?')
const listOfHomeStmt = db.prepare(
  `SELECT c.id, c.partner_id AS partnerId, p.name AS partnerName, p.typ AS partnerTyp, c.dog_id AS dogId, d.name AS tierName,
     c.status, c.zeige_mich AS zeigeMich, c.created_at AS createdAt
   FROM wwh_checkins c
   JOIN partners p ON p.id = c.partner_id AND ${publicPartnerSql('p')}
   JOIN dogs d ON d.id = c.dog_id
   WHERE c.family_id = ?
   ORDER BY p.name COLLATE NOCASE, d.name COLLATE NOCASE, c.id`
)

// Meldet das eigene Tier dogId des Zuhauses homeId bei einem sichtbaren Partner an (Status 'offen' - der Partner gibt
// frei). 400 außerhalb eines Zuhauses, 404 für fremdes/unbekanntes Tier und unsichtbaren Partner (kein Unterschied
// zu „gibt es nicht“), 409 bei doppelter Anmeldung und an der Obergrenze. Demo und Echt nie gemischt.
const createCheckin = db.transaction((homeId, { partnerId, dogId }) => {
  const home = findHome(homeId)
  if (!home) throw httpError(400, ONLY_HOME_MESSAGE)
  if (!Number.isInteger(dogId) || !ownDogStmt.get(dogId, homeId)) throw httpError(404, NO_SUCH_DOG_MESSAGE)
  if (!Number.isInteger(partnerId) || !visiblePartnerStmt.get(partnerId, home.is_demo)) throw httpError(404, NO_SUCH_PLACE_MESSAGE)
  if (findExistingStmt.get(partnerId, dogId)) throw httpError(409, ALREADY_MESSAGE)
  if (countByHomeStmt.get(homeId) >= MAX_CHECKINS_PER_HOME) throw httpError(409, TOO_MANY_MESSAGE)
  const id = Number(insertStmt.run({ partnerId, homeId, dogId, isDemo: home.is_demo ? 1 : 0 }).lastInsertRowid)
  return { id, partnerId, dogId, status: STATUS.offen, zeigeMich: false }
})

// „Hier zeigen“ an/aus - nur ein echter Boolean (400). Aus: offene Kontaktwünsche an dieses Tier werden abgelehnt.
const setZeigeMich = db.transaction((homeId, checkinId, value) => {
  if (typeof value !== 'boolean') throw httpError(400, BOOLEAN_MESSAGE)
  const row = Number.isInteger(checkinId) ? findOwnStmt.get(checkinId, homeId) : null
  if (!row) throw httpError(404, NO_SUCH_CHECKIN_MESSAGE)
  setZeigeStmt.run(value ? 1 : 0, row.id)
  if (!value) declineOpenWishesToDogStmt.run({ partnerId: row.partner_id, dogId: row.dog_id })
  return { id: row.id, zeigeMich: value }
})

// Rückzug: löscht die Anmeldung samt Anheftungen (CASCADE) und den offenen Kontaktwünschen dieses Tiers an diesem Ort.
// Bestehende Besuche bleiben (Beenden über /api/besuche).
const withdrawCheckin = db.transaction((homeId, checkinId) => {
  const row = Number.isInteger(checkinId) ? findOwnStmt.get(checkinId, homeId) : null
  if (!row) throw httpError(404, NO_SUCH_CHECKIN_MESSAGE)
  deleteOpenWishesOfDogStmt.run({ partnerId: row.partner_id, dogId: row.dog_id })
  deleteCheckinStmt.run(row.id)
  pruneRueckzugStmt.run(homeId)
  logRueckzugStmt.run(homeId, row.partner_id)
})

// Hat das Zuhause am Ort in den letzten RENOTIFY_QUIET_MINUTES eine Anmeldung zurückgezogen? (kein Hinweis-Pingpong)
function withdrewRecently(homeId, partnerId) {
  return Boolean(recentRueckzugStmt.get(homeId, partnerId))
}

// Die Anmeldungen des Zuhauses; Orte, die der Admin sperrt oder pausiert, fehlen (der Ort ist ausgeblendet).
function checkinsOfHome(homeId) {
  return listOfHomeStmt.all(homeId).map(({ zeigeMich, ...rest }) => ({ ...rest, zeigeMich: Boolean(zeigeMich) }))
}

// Demo-Pack: alle Demo-Zeilen (is_demo = 1) und alle Zeilen der Partner des letzten Laufs (previousPartnerIds - die
// werden gleich gelöscht) wegräumen. Anheftungen fallen per CASCADE mit den Anmeldungen.
function removeDemoWirWarenHier(previousPartnerIds = []) {
  const placeholders = previousPartnerIds.map(() => '?').join(', ')
  const where = previousPartnerIds.length ? `is_demo = 1 OR partner_id IN (${placeholders})` : 'is_demo = 1'
  db.prepare(`DELETE FROM wwh_kontakt WHERE ${where}`).run(...previousPartnerIds)
  db.prepare(`DELETE FROM wwh_checkins WHERE ${where}`).run(...previousPartnerIds)
}

module.exports = {
  STATUS,
  MAX_CHECKINS_PER_HOME,
  RENOTIFY_QUIET_MINUTES,
  ONLY_HOME_MESSAGE,
  NO_SUCH_CHECKIN_MESSAGE,
  httpError,
  createCheckin,
  setZeigeMich,
  withdrawCheckin,
  withdrewRecently,
  checkinsOfHome,
  removeDemoWirWarenHier
}
