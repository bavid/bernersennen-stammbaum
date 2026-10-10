'use strict'

// „Wir waren hier“ Aufgabe 4 (docs/superpowers/plans/2026-10-10-wir-waren-hier.md): Kontaktwunsch über den Ort.
// Ein Zuhause, dessen Tier an einem Ort freigegeben angemeldet ist, bittet ein anderes Tier desselben Orts um Kontakt
// (nur, wenn das Ziel freigegeben ist UND „hier gezeigt“ wird). Sagt das Ziel-Zuhause zu, entsteht ein normaler Besuch
// (lib/visits.js addVisit + acknowledgeGuest): die Anfragende sieht die nicht privaten Erinnerungen des Ziel-Zuhauses.
// Widerruf = bestehender Besuchs-Abbruch (/api/besuche). Die Tabelle wwh_kontakt steht in lib/wirWarenHier.js (Rückzug
// und „zeige mich“ aus räumen sie dort mit auf); hier nur das Versand-Protokoll für die Tagesgrenze - es zählt auch
// zurückgezogene Wünsche, damit Zurückziehen + neu Senden keine Benachrichtigungsflut ergibt.
// Antworten nennen nie Familien-/Personennamen oder Zuhause-Ids - nur Tiername, Tierart, Foto und Ort.

const db = require('../db')
const { publicPartnerSql } = require('./partners')
const { findHome, isVisiting, addVisit, acknowledgeGuest } = require('./visits')
const { httpError, ONLY_HOME_MESSAGE } = require('./wirWarenHier')

db.exec(`
  CREATE TABLE IF NOT EXISTS wwh_kontakt_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    von_family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_wwh_kontakt_log_von ON wwh_kontakt_log(von_family_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_wwh_kontakt_von ON wwh_kontakt(von_family_id, status);
`)

const KONTAKT_STATUS = Object.freeze({ offen: 'offen', angenommen: 'angenommen', abgelehnt: 'abgelehnt' })
const MAX_OPEN_PER_HOME = 5
const MAX_NEW_PER_DAY = 3
const MAX_OPEN_PER_TARGET = 10
const COOLDOWN_DAYS = 30
const LIST_LIMIT = 50

const NO_SUCH_WISH_MESSAGE = 'Diesen Kontaktwunsch gibt es nicht'
const NO_SUCH_TARGET_MESSAGE = 'Dieses Tier gibt es hier nicht'
const NO_SUCH_DOG_MESSAGE = 'Dieses Tier gibt es nicht'
const OWN_NOT_HERE_MESSAGE = 'Euer Tier muss an diesem Ort angemeldet und freigegeben sein.'
const SELF_MESSAGE = 'Das ist euer eigenes Zuhause.'
const ALREADY_MESSAGE = 'Ihr habt diesem Tier schon geschrieben.'
const VISITING_MESSAGE = 'Ihr seid dort schon zu Besuch.'
const COOLDOWN_MESSAGE = `Diesen Wunsch könnt ihr erst ${COOLDOWN_DAYS} Tage nach der Antwort erneut stellen.`
const TOO_MANY_OPEN_MESSAGE = `Ihr habt schon ${MAX_OPEN_PER_HOME} offene Kontaktwünsche – wartet, bis sie beantwortet sind.`
const TOO_MANY_TODAY_MESSAGE = `Höchstens ${MAX_NEW_PER_DAY} neue Kontaktwünsche am Tag – bitte morgen noch einmal.`
const STALE_MESSAGE = 'Dieser Kontaktwunsch gilt nicht mehr – der Ort oder eine Anmeldung hat sich geändert.'
const TARGET_FULL_MESSAGE = 'Dieses Zuhause hat gerade viele offene Wünsche – bitte später noch einmal.'

// Ziel: freigegeben, „hier gezeigt“, Tier gehört der Anmeldung, Ort sichtbar, alles auf der is_demo-Seite des Zuhauses.
const targetStmt = db.prepare(
  `SELECT c.id, c.partner_id AS partnerId, c.family_id AS familyId, c.dog_id AS dogId
   FROM wwh_checkins c
   JOIN dogs d ON d.id = c.dog_id AND d.family_id = c.family_id
   JOIN partners p ON p.id = c.partner_id AND p.is_demo = c.is_demo AND ${publicPartnerSql('p')}
   WHERE c.id = ? AND c.status = 'bestaetigt' AND c.zeige_mich = 1 AND c.is_demo = ?`
)
const ownDogStmt = db.prepare('SELECT id FROM dogs WHERE id = ? AND family_id = ?')
const ownCheckinStmt = db.prepare(
  "SELECT id FROM wwh_checkins WHERE family_id = ? AND dog_id = ? AND partner_id = ? AND status = 'bestaetigt'"
)
const existingStmt = db.prepare(
  `SELECT id, status, (entschieden_at > datetime('now', '-${COOLDOWN_DAYS} days')) AS inCooldown
   FROM wwh_kontakt WHERE von_dog_id = ? AND an_dog_id = ?`
)
const countOpenFromStmt = db.prepare("SELECT COUNT(*) FROM wwh_kontakt WHERE von_family_id = ? AND status = 'offen'").pluck()
const countOpenToStmt = db.prepare("SELECT COUNT(*) FROM wwh_kontakt WHERE an_family_id = ? AND status = 'offen'").pluck()
const countSentTodayStmt = db
  .prepare("SELECT COUNT(*) FROM wwh_kontakt_log WHERE von_family_id = ? AND created_at > datetime('now', '-1 day')")
  .pluck()
const pruneLogStmt = db.prepare("DELETE FROM wwh_kontakt_log WHERE von_family_id = ? AND created_at <= datetime('now', '-1 day')")
const logStmt = db.prepare('INSERT INTO wwh_kontakt_log (von_family_id) VALUES (?)')
const insertStmt = db.prepare(
  `INSERT INTO wwh_kontakt (partner_id, von_family_id, von_dog_id, an_family_id, an_dog_id, is_demo)
   VALUES (@partnerId, @vonFamilyId, @vonDogId, @anFamilyId, @anDogId, @isDemo)`
)
const reopenStmt = db.prepare(
  `UPDATE wwh_kontakt SET partner_id = @partnerId, von_family_id = @vonFamilyId, an_family_id = @anFamilyId,
     status = 'offen', is_demo = @isDemo, created_at = datetime('now'), entschieden_at = NULL
   WHERE id = @id`
)
// Zusage nur, wenn der Wunsch noch trägt: Ort sichtbar (gleiche is_demo-Seite), beide Anmeldungen freigegeben, das Ziel
// wird weiterhin „hier gezeigt“.
const stillValidStmt = db.prepare(
  `SELECT 1 FROM partners p
   JOIN wwh_checkins v ON v.partner_id = p.id AND v.family_id = @vonFamilyId AND v.dog_id = @vonDogId
     AND v.status = 'bestaetigt' AND v.is_demo = p.is_demo
   JOIN wwh_checkins a ON a.partner_id = p.id AND a.family_id = @anFamilyId AND a.dog_id = @anDogId
     AND a.status = 'bestaetigt' AND a.zeige_mich = 1 AND a.is_demo = p.is_demo
   WHERE p.id = @partnerId AND p.is_demo = @isDemo AND ${publicPartnerSql('p')}`
)
const incomingStmt = db.prepare('SELECT * FROM wwh_kontakt WHERE id = ? AND an_family_id = ?')
const decideStmt = db.prepare("UPDATE wwh_kontakt SET status = ?, entschieden_at = datetime('now') WHERE id = ?")
const withdrawStmt = db.prepare("DELETE FROM wwh_kontakt WHERE id = ? AND von_family_id = ? AND status = 'offen'")

// Liste: nur Tiername/Tierart/Foto, der eigene Tiername und der Ort - nie Familien-Namen oder -Ids.
const listSql = (mine, other) => `
  SELECT k.id, od.name AS tierName, od.tierart, od.foto_url AS fotoUrl, md.name AS eigenesTierName,
    p.name AS ortName, k.created_at AS createdAt
  FROM wwh_kontakt k
  JOIN dogs od ON od.id = k.${other}_dog_id
  JOIN dogs md ON md.id = k.${mine}_dog_id
  JOIN partners p ON p.id = k.partner_id AND p.is_demo = k.is_demo AND ${publicPartnerSql('p')}
  WHERE k.${mine}_family_id = ? AND k.status = 'offen'
  ORDER BY k.created_at DESC, k.id DESC LIMIT ${LIST_LIMIT}`
const incomingListStmt = db.prepare(listSql('an', 'von'))
const outgoingListStmt = db.prepare(listSql('von', 'an'))

function findTarget(home, checkinId) {
  const target = Number.isInteger(checkinId) ? targetStmt.get(checkinId, home.is_demo ? 1 : 0) : null
  if (!target) throw httpError(404, NO_SUCH_TARGET_MESSAGE)
  if (target.familyId === home.id) throw httpError(400, SELF_MESSAGE)
  return target
}

function assertOwnDogHere(homeId, dogId, partnerId) {
  if (!Number.isInteger(dogId) || !ownDogStmt.get(dogId, homeId)) throw httpError(404, NO_SUCH_DOG_MESSAGE)
  if (!ownCheckinStmt.get(homeId, dogId, partnerId)) throw httpError(400, OWN_NOT_HERE_MESSAGE)
}

// Bestehender Wunsch zwischen den beiden Tieren: offen → 409; beantwortet → erst nach COOLDOWN_DAYS erneut (kein Dauerbitten).
function assertNoPendingWish(existing) {
  if (!existing) return
  if (existing.status === KONTAKT_STATUS.offen) throw httpError(409, ALREADY_MESSAGE)
  if (existing.inCooldown) throw httpError(409, COOLDOWN_MESSAGE)
}

function assertLimits(homeId, targetFamilyId) {
  if (countOpenFromStmt.get(homeId) >= MAX_OPEN_PER_HOME) throw httpError(409, TOO_MANY_OPEN_MESSAGE)
  pruneLogStmt.run(homeId)
  if (countSentTodayStmt.get(homeId) >= MAX_NEW_PER_DAY) throw httpError(429, TOO_MANY_TODAY_MESSAGE)
  if (countOpenToStmt.get(targetFamilyId) >= MAX_OPEN_PER_TARGET) throw httpError(409, TARGET_FULL_MESSAGE)
}

// Wunsch senden { checkinId (Ziel-Anmeldung), eigenesDogId }. 400 außerhalb eines Zuhauses, an sich selbst oder wenn das
// eigene Tier hier nicht freigegeben angemeldet ist; 404 für unbekanntes/unsichtbares Ziel und fremdes Tier.
const sendWish = db.transaction((homeId, { checkinId, eigenesDogId }) => {
  const home = findHome(homeId)
  if (!home) throw httpError(400, ONLY_HOME_MESSAGE)
  const target = findTarget(home, checkinId)
  assertOwnDogHere(homeId, eigenesDogId, target.partnerId)
  if (isVisiting(homeId, target.familyId)) throw httpError(409, VISITING_MESSAGE)
  const existing = existingStmt.get(eigenesDogId, target.dogId)
  assertNoPendingWish(existing)
  assertLimits(homeId, target.familyId)
  const values = {
    partnerId: target.partnerId,
    vonFamilyId: homeId,
    vonDogId: eigenesDogId,
    anFamilyId: target.familyId,
    anDogId: target.dogId,
    isDemo: home.is_demo ? 1 : 0
  }
  let id = existing?.id
  if (existing) reopenStmt.run({ ...values, id })
  else id = Number(insertStmt.run(values).lastInsertRowid)
  logStmt.run(homeId)
  return { id, status: KONTAKT_STATUS.offen, anFamilyId: target.familyId }
})

function assertStillValid(row) {
  const params = {
    partnerId: row.partner_id,
    vonFamilyId: row.von_family_id,
    vonDogId: row.von_dog_id,
    anFamilyId: row.an_family_id,
    anDogId: row.an_dog_id,
    isDemo: row.is_demo ? 1 : 0
  }
  if (!stillValidStmt.get(params)) throw httpError(409, STALE_MESSAGE)
}

// Zusage: legt den Besuch an (Anfragende = Gast beim Ziel-Zuhause) und bestätigt ihn gleich. Idempotent: eine schon
// angenommene Anfrage bleibt angenommen, ein bestehender Besuch wird nicht verdoppelt. Demo und Echt nie verbunden.
const acceptWish = db.transaction((homeId, id) => {
  const row = Number.isInteger(id) ? incomingStmt.get(id, homeId) : null
  if (!row || row.status === KONTAKT_STATUS.abgelehnt) throw httpError(404, NO_SUCH_WISH_MESSAGE)
  const guest = findHome(row.von_family_id)
  const host = findHome(homeId)
  if (!guest || !host || Boolean(guest.is_demo) !== Boolean(host.is_demo)) throw httpError(404, NO_SUCH_WISH_MESSAGE)
  const isNew = row.status === KONTAKT_STATUS.offen
  if (isNew) {
    assertStillValid(row)
    if (!isVisiting(guest.id, host.id)) addVisit(guest.id, host.id)
    acknowledgeGuest(guest.id, host.id)
    decideStmt.run(KONTAKT_STATUS.angenommen, row.id)
  }
  return { id: row.id, status: KONTAKT_STATUS.angenommen, vonFamilyId: guest.id, isNew }
})

// Absage: nur das Ziel-Zuhause, nur offene (eine schon abgelehnte bleibt abgelehnt; Zusagen endet man über /api/besuche).
const rejectWish = db.transaction((homeId, id) => {
  const row = Number.isInteger(id) ? incomingStmt.get(id, homeId) : null
  if (!row || row.status === KONTAKT_STATUS.angenommen) throw httpError(404, NO_SUCH_WISH_MESSAGE)
  if (row.status === KONTAKT_STATUS.offen) decideStmt.run(KONTAKT_STATUS.abgelehnt, row.id)
  return { id: row.id, status: KONTAKT_STATUS.abgelehnt }
})

// Zurückziehen: nur die Absenderin, nur offene Wünsche.
function withdrawWish(homeId, id) {
  if (!Number.isInteger(id) || withdrawStmt.run(id, homeId).changes !== 1) throw httpError(404, NO_SUCH_WISH_MESSAGE)
}

// { an: Wünsche an uns, von: unsere offenen Wünsche } - Orte, die gesperrt oder pausiert sind, fehlen.
function openWishes(homeId) {
  return { an: incomingListStmt.all(homeId), von: outgoingListStmt.all(homeId) }
}

// Mit Benachrichtigung (lib/push.js, feste Texte ohne Namen; verschickt erst nach der Transaktion per setImmediate).
function sendWishAndNotify(homeId, input) {
  const { anFamilyId, ...result } = sendWish(homeId, input)
  const { EREIGNIS, notifyHome } = require('./push')
  notifyHome(anFamilyId, EREIGNIS.kontakt)
  return result
}

function acceptWishAndNotify(homeId, id) {
  const { vonFamilyId, isNew, ...result } = acceptWish(homeId, id)
  const { EREIGNIS, notifyHome } = require('./push')
  if (isNew) notifyHome(vonFamilyId, EREIGNIS.kontaktZusage)
  return result
}

module.exports = {
  KONTAKT_STATUS,
  MAX_OPEN_PER_HOME,
  MAX_NEW_PER_DAY,
  MAX_OPEN_PER_TARGET,
  COOLDOWN_DAYS,
  sendWish,
  acceptWish,
  rejectWish,
  withdrawWish,
  openWishes,
  sendWishAndNotify,
  acceptWishAndNotify
}
