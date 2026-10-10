'use strict'

// „Wir waren hier“: Freigabe durch den Partner und angeheftete Erinnerungen (Tabellen: lib/wirWarenHier.js).
// Familie: eine eigene, nicht private Erinnerung des angemeldeten Tiers an eine freigegebene Anmeldung heften; der Partner
// gibt jede Anmeldung und jede Anheftung frei (Muster erlebt_mit, lib/erlebtMit.js). Sichtbar ist eine Anheftung nur, solange
// ihre Anmeldung bestätigt ist UND der Eintrag noch existiert, nicht privat ist und zum angemeldeten Tier gehört - das
// prüft jede Ausgabe neu (PIN_VISIBLE_SQL), nicht nur das Anheften. Ändert sich der Inhalt eines Eintrags, geht die
// Anheftung zurück auf 'offen' (reopenPins, wie reopenConfirmedTags); wird er privat, fällt sie weg (clearPins).
// Fremde Ids liefern immer 404 (JOIN auf Zuhause bzw. partner_id im SQL, kein „erst laden, dann vergleichen“).

const db = require('../db')
const { STATUS, httpError, NO_SUCH_CHECKIN_MESSAGE, createCheckin, withdrewRecently } = require('./wirWarenHier')
// Als Modul-Objekt (nicht destrukturiert), damit Tests notifyPartner ersetzen können.
const partnerNotify = require('./partnerNotify')

const MAX_PINS_PER_CHECKIN = 20
const PARTNER_LIST_LIMIT = 200

const NO_SUCH_ENTRY_MESSAGE = 'Diese Erinnerung gibt es nicht'
const NO_SUCH_PIN_MESSAGE = 'Diese Anheftung gibt es nicht'
const NOT_CONFIRMED_MESSAGE = 'Der Ort hat die Anmeldung noch nicht freigegeben.'
const PRIVATE_MESSAGE = 'Private Erinnerungen kannst du nicht anheften.'
const PIN_EXISTS_MESSAGE = 'Diese Erinnerung ist hier schon angeheftet'
const TOO_MANY_PINS_MESSAGE = `Hier können höchstens ${MAX_PINS_PER_CHECKIN} Erinnerungen angeheftet sein.`
const NO_SUCH_REQUEST_MESSAGE = 'Diese Anfrage gibt es nicht'

// Aliase p (Anheftung), c (Anmeldung), t (Eintrag): die Anmeldung ist bestätigt, der Eintrag gehört dem angemeldeten Tier
// im Zuhause der Anmeldung und ist nicht privat.
const PIN_VISIBLE_SQL = `c.status = 'bestaetigt' AND t.privat = 0 AND t.family_id = c.family_id AND t.dog_id = c.dog_id`
const PIN_FROM_SQL = `FROM wwh_pins p JOIN wwh_checkins c ON c.id = p.checkin_id JOIN timeline_entries t ON t.id = p.entry_id`

const findOwnCheckinStmt = db.prepare('SELECT id, dog_id, status FROM wwh_checkins WHERE id = ? AND family_id = ?')
const findEntryStmt = db.prepare('SELECT id, privat FROM timeline_entries WHERE id = ? AND family_id = ? AND dog_id = ?')
const countPinsStmt = db.prepare('SELECT COUNT(*) AS c FROM wwh_pins WHERE checkin_id = ?').pluck()
const findPinStmt = db.prepare('SELECT 1 FROM wwh_pins WHERE checkin_id = ? AND entry_id = ?')
const insertPinStmt = db.prepare('INSERT INTO wwh_pins (checkin_id, entry_id) VALUES (?, ?)')
const deleteOwnPinStmt = db.prepare(
  'DELETE FROM wwh_pins WHERE id = @pinId AND checkin_id IN (SELECT id FROM wwh_checkins WHERE id = @checkinId AND family_id = @homeId)'
)
const ownPinsStmt = db.prepare(
  `SELECT p.id, p.entry_id AS entryId, p.status, t.titel, t.datum ${PIN_FROM_SQL}
   WHERE p.checkin_id = @checkinId AND c.family_id = @homeId AND p.status != 'abgelehnt' AND t.privat = 0 AND t.family_id = c.family_id AND t.dog_id = c.dog_id
   ORDER BY t.datum DESC, p.id DESC`
)

// Heftet die eigene, nicht private Erinnerung entryId des angemeldeten Tiers an die bestätigte Anmeldung checkinId.
// Status 'offen' - der Partner gibt frei. 404 für Fremdes/Unbekanntes, 400 für private Einträge, 409 für nicht
// freigegebene Anmeldung, doppelte Anheftung und die Obergrenze.
const pinEntry = db.transaction((homeId, checkinId, entryId) => {
  const checkin = Number.isInteger(checkinId) ? findOwnCheckinStmt.get(checkinId, homeId) : null
  if (!checkin) throw httpError(404, NO_SUCH_CHECKIN_MESSAGE)
  const entry = Number.isInteger(entryId) ? findEntryStmt.get(entryId, homeId, checkin.dog_id) : null
  if (!entry) throw httpError(404, NO_SUCH_ENTRY_MESSAGE)
  if (checkin.status !== STATUS.bestaetigt) throw httpError(409, NOT_CONFIRMED_MESSAGE)
  if (entry.privat) throw httpError(400, PRIVATE_MESSAGE)
  if (findPinStmt.get(checkin.id, entry.id)) throw httpError(409, PIN_EXISTS_MESSAGE)
  if (countPinsStmt.get(checkin.id) >= MAX_PINS_PER_CHECKIN) throw httpError(409, TOO_MANY_PINS_MESSAGE)
  const id = Number(insertPinStmt.run(checkin.id, entry.id).lastInsertRowid)
  return { id, entryId: entry.id, status: STATUS.offen }
})

// Löst eine Anheftung (nur der eigenen Anmeldung).
function unpinEntry(homeId, checkinId, pinId) {
  const params = { homeId, checkinId, pinId }
  const known = Number.isInteger(checkinId) && Number.isInteger(pinId)
  if (!known || deleteOwnPinStmt.run(params).changes !== 1) throw httpError(404, NO_SUCH_PIN_MESSAGE)
}

// Die sichtbaren Anheftungen einer eigenen Anmeldung: [{ id, entryId, status, titel, datum }] - ohne abgelehnte
// (wie erlebt_mit: Ablehnen blendet überall aus; erneutes Anheften bleibt 409, kein Dauerbitten).
function pinsOfCheckin(homeId, checkinId) {
  return Number.isInteger(checkinId) ? ownPinsStmt.all({ homeId, checkinId }) : []
}

// Neue Anmeldung (lib/wirWarenHier.js createCheckin) und danach - außerhalb der Transaktion - der Hinweis an den Ort.
// notifyPartner wirft nie, schickt Demo-Partnern nichts und begrenzt die Menge (admitToCap); der Text nennt keine Namen.
// Kurz nach einem Rückzug am selben Ort (withdrewRecently) bleibt der Hinweis aus - die Anmeldung selbst klappt.
function checkInAndNotify(homeId, input) {
  const created = createCheckin(homeId, input)
  if (!withdrewRecently(homeId, created.partnerId)) partnerNotify.notifyPartner(created.partnerId, partnerNotify.PARTNER_EREIGNIS.anmeldung)
  return created
}

// --- Hooks der Chronik-Routen (innerhalb der Speicher-Transaktion, lib/erlebtMitView.js applyTags) -----------------

const clearPinsStmt = db.prepare('DELETE FROM wwh_pins WHERE entry_id = ?')
const reopenPinsStmt = db.prepare(
  "UPDATE wwh_pins SET status = 'offen', entschieden_at = NULL, created_at = datetime('now') WHERE entry_id = ? AND status = 'bestaetigt'"
)

// Der Eintrag wird privat: alle Anheftungen fallen weg.
function clearPins(entryId) {
  clearPinsStmt.run(entryId)
}

// Der Inhalt eines Eintrags hat sich geändert: der Partner muss erneut zustimmen.
function reopenPins(entryId) {
  reopenPinsStmt.run(entryId)
}

// --- Partner ---------------------------------------------------------------------------------------------------

const partnerCheckinsStmt = db.prepare(
  `SELECT c.id, c.status, c.created_at AS createdAt, d.name AS tierName, d.tierart, d.foto_url AS fotoUrl
   FROM wwh_checkins c JOIN dogs d ON d.id = c.dog_id
   WHERE c.partner_id = ? AND c.status IN ('offen', 'bestaetigt')
   ORDER BY (c.status = 'offen') DESC, c.created_at DESC, c.id DESC LIMIT ${PARTNER_LIST_LIMIT}`
)
const partnerPinsStmt = db.prepare(
  `SELECT p.id, p.checkin_id AS checkinId, p.status, p.created_at AS createdAt, d.name AS tierName, t.titel, t.datum, t.text
   ${PIN_FROM_SQL} JOIN dogs d ON d.id = c.dog_id
   WHERE c.partner_id = ? AND p.status IN ('offen', 'bestaetigt') AND ${PIN_VISIBLE_SQL}
   ORDER BY (p.status = 'offen') DESC, p.created_at DESC, p.id DESC LIMIT ${PARTNER_LIST_LIMIT}`
)

// Was ein Partner sieht: Anmeldungen und Anheftungen seines Ortes (offene zuerst; freigegebene bleiben, damit er sie
// später wieder ablehnen oder entfernen kann). Nie Familien- oder Personennamen, Ids von Zuhausen oder Adressen.
function overviewForPartner(partnerId) {
  return { anmeldungen: partnerCheckinsStmt.all(partnerId), erinnerungen: partnerPinsStmt.all(partnerId) }
}

const findPartnerCheckinStmt = db.prepare('SELECT id, status, dog_id, family_id FROM wwh_checkins WHERE id = ? AND partner_id = ?')
const setCheckinStatusStmt = db.prepare("UPDATE wwh_checkins SET status = ?, entschieden_at = datetime('now') WHERE id = ?")
const declineWishesOfDogStmt = db.prepare(
  `UPDATE wwh_kontakt SET status = 'abgelehnt', entschieden_at = datetime('now')
   WHERE partner_id = @partnerId AND (von_dog_id = @dogId OR an_dog_id = @dogId) AND status = 'offen'`
)
const deleteWishesOfDogStmt = db.prepare('DELETE FROM wwh_kontakt WHERE partner_id = @partnerId AND (von_dog_id = @dogId OR an_dog_id = @dogId)')
const deleteCheckinStmt = db.prepare('DELETE FROM wwh_checkins WHERE id = ?')
const findPartnerPinStmt = db.prepare(
  `SELECT p.id, p.status ${PIN_FROM_SQL} WHERE p.id = ? AND c.partner_id = ? AND ${PIN_VISIBLE_SQL}`
)
const setPinStatusStmt = db.prepare("UPDATE wwh_pins SET status = ?, entschieden_at = datetime('now') WHERE id = ?")

// Gibt eine Anmeldung frei (nur aus 'offen') oder lehnt sie ab (aus 'offen' und 'bestaetigt'; offene Kontaktwünsche
// dieses Tiers an diesem Ort werden dann abgelehnt). 404 für alles, was nicht zum eigenen Ort gehört.
const decideCheckin = db.transaction((partnerId, id, status) => {
  const row = Number.isInteger(id) ? findPartnerCheckinStmt.get(id, partnerId) : null
  const allowed = row && (status === STATUS.bestaetigt ? row.status === STATUS.offen : row.status !== STATUS.abgelehnt)
  if (!allowed) throw httpError(404, NO_SUCH_REQUEST_MESSAGE)
  setCheckinStatusStmt.run(status, row.id)
  if (status === STATUS.abgelehnt) declineWishesOfDogStmt.run({ partnerId, dogId: row.dog_id })
  return { id: row.id, status }
})

// Gibt eine angeheftete Erinnerung frei (nur aus 'offen') oder lehnt sie ab (blendet sie überall aus).
function decidePin(partnerId, id, status) {
  const row = Number.isInteger(id) ? findPartnerPinStmt.get(id, partnerId) : null
  const allowed = row && (status === STATUS.bestaetigt ? row.status === STATUS.offen : row.status !== STATUS.abgelehnt)
  if (!allowed) throw httpError(404, NO_SUCH_REQUEST_MESSAGE)
  setPinStatusStmt.run(status, row.id)
  return { id: row.id, status }
}

// Nachträglich entfernen: löscht die Anmeldung samt Anheftungen und Kontaktwünschen. Bestehende Besuche bleiben.
const removeCheckinAsPartner = db.transaction((partnerId, id) => {
  const row = Number.isInteger(id) ? findPartnerCheckinStmt.get(id, partnerId) : null
  if (!row) throw httpError(404, NO_SUCH_REQUEST_MESSAGE)
  deleteWishesOfDogStmt.run({ partnerId, dogId: row.dog_id })
  deleteCheckinStmt.run(row.id)
})

module.exports = {
  MAX_PINS_PER_CHECKIN,
  PIN_VISIBLE_SQL,
  checkInAndNotify,
  pinEntry,
  unpinEntry,
  pinsOfCheckin,
  clearPins,
  reopenPins,
  overviewForPartner,
  decideCheckin,
  decidePin,
  removeCheckinAsPartner
}
