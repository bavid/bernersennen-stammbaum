'use strict'

// „Wir waren hier“ in der Demo (seed/demo-wir-waren-hier.js, Plan 2026-10-10 Aufgabe 5). Läuft innerhalb der
// replaceDemoPack-Transaktion (lib/demoPack.js):
// - removeDemoWwh VOR dem Löschen der alten Demo-Partner: Anmeldungen/Kontaktwünsche mit is_demo = 1 oder an einem
//   alten Demo-Partner (lib/wirWarenHier.js removeDemoWirWarenHier; Anheftungen fallen per CASCADE) und das
//   Versand-Protokoll (wwh_kontakt_log) der Demo-Zuhause - echte Zeilen (is_demo = 0) bleiben unberührt;
// - createDemoWwh NACH den Demo-Partnern, „Zuhause am Deich“ und den Demo-Besuchen (braucht deren Ids).

const { removeDemoWirWarenHier } = require('./wirWarenHier')
require('./wwhKontakt') // legt wwh_kontakt_log an (CREATE TABLE IF NOT EXISTS)
const { PLACE_SLUG, DEICH, CHECKINS, PINS, KONTAKTE } = require('../seed/demo-wir-waren-hier')

function removeDemoWwh(db, previousPartnerIds) {
  removeDemoWirWarenHier(previousPartnerIds)
  db.prepare('DELETE FROM wwh_kontakt_log WHERE von_family_id IN (SELECT id FROM families WHERE is_demo = 1)').run()
}

function resolveDog(db, { householdId, householdDogIds, memberHouseholds }, checkin) {
  if (checkin.home === DEICH) {
    const dogId = householdDogIds[checkin.tier]
    if (!dogId) throw new Error(`Demo „Wir waren hier“: Tier "${checkin.tier}" fehlt am Deich`)
    return { familyId: householdId, dogId }
  }
  const home = memberHouseholds.find((member) => member.name === checkin.home)
  if (!home) throw new Error(`Demo „Wir waren hier“: Zuhause "${checkin.home}" fehlt`)
  const dog = db.prepare('SELECT id FROM dogs WHERE family_id = ? AND name = ?').get(home.familyId, checkin.tier)
  if (!dog) throw new Error(`Demo „Wir waren hier“: Tier "${checkin.tier}" fehlt`)
  return { familyId: home.familyId, dogId: dog.id }
}

function insertCheckins(db, partnerId, ids) {
  const insert = db.prepare(
    `INSERT INTO wwh_checkins (partner_id, family_id, dog_id, status, zeige_mich, is_demo, created_at, entschieden_at)
     VALUES (?, ?, ?, ?, ?, 1, datetime('now', ?), CASE WHEN ? = 'offen' THEN NULL ELSE datetime('now', ?) END)`
  )
  const checkins = {}
  for (const checkin of CHECKINS) {
    const { familyId, dogId } = resolveDog(db, ids, checkin)
    const ago = `-${checkin.tageHer} days`
    const decidedAgo = `-${Math.max(0, checkin.tageHer - 1)} days`
    const id = insert.run(partnerId, familyId, dogId, checkin.status, checkin.zeigeMich ? 1 : 0, ago, checkin.status, decidedAgo).lastInsertRowid
    checkins[checkin.key] = { id: Number(id), familyId, dogId }
  }
  return checkins
}

function insertPins(db, checkins) {
  const findEntry = db.prepare('SELECT id FROM timeline_entries WHERE family_id = ? AND dog_id = ? AND titel = ? AND privat = 0')
  const insert = db.prepare(
    `INSERT INTO wwh_pins (checkin_id, entry_id, status, created_at, entschieden_at)
     VALUES (?, ?, ?, datetime('now', ?), CASE WHEN ? = 'offen' THEN NULL ELSE datetime('now', ?) END)`
  )
  for (const pin of PINS) {
    const checkin = checkins[pin.checkin]
    const entry = checkin && findEntry.get(checkin.familyId, checkin.dogId, pin.titel)
    if (!entry) throw new Error(`Demo „Wir waren hier“: Erinnerung "${pin.titel}" fehlt`)
    insert.run(checkin.id, entry.id, pin.status, `-${pin.tageHer} days`, pin.status, `-${Math.max(0, pin.tageHer - 1)} days`)
  }
}

function insertKontakte(db, partnerId, checkins) {
  const insert = db.prepare(
    `INSERT INTO wwh_kontakt (partner_id, von_family_id, von_dog_id, an_family_id, an_dog_id, status, is_demo, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now', ?))`
  )
  for (const kontakt of KONTAKTE) {
    const von = checkins[kontakt.von]
    const an = checkins[kontakt.an]
    if (!von || !an) throw new Error('Demo „Wir waren hier“: Anmeldung für den Kontaktwunsch fehlt')
    insert.run(partnerId, von.familyId, von.dogId, an.familyId, an.dogId, kontakt.status, `-${kontakt.stundenHer} hours`)
  }
}

// householdId/householdDogIds: „Zuhause am Deich“ (lib/demoPack.js createDemoHousehold); memberHouseholds: die Demo-Haushalte
// (lib/demoMembers.js). Der Ort ist ein frisch angelegter Demo-Partner (is_demo = 1).
function createDemoWwh(db, ids) {
  const partner = db.prepare('SELECT id FROM partners WHERE slug = ? AND is_demo = 1').get(PLACE_SLUG)
  if (!partner) throw new Error(`Demo „Wir waren hier“: Demo-Partner "${PLACE_SLUG}" fehlt`)
  const checkins = insertCheckins(db, partner.id, ids)
  insertPins(db, checkins)
  insertKontakte(db, partner.id, checkins)
  return { partnerId: partner.id, checkins: CHECKINS.length, pins: PINS.length, kontakte: KONTAKTE.length }
}

module.exports = { removeDemoWwh, createDemoWwh }
