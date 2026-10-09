'use strict'

// „Wir waren hier“ Aufgabe 3 (docs/superpowers/plans/2026-10-10-wir-waren-hier.md): die Ortsansicht eines Zuhauses.
// Eigene Anmeldungen an diesem Ort (mit Status und eigenen Anheftungen) und die Tiere ANDERER Familien, die der Ort
// freigegeben hat UND die „hier gezeigt“ werden (status = 'bestaetigt' AND zeige_mich = 1). Von fremden Tieren gehen
// nur ORT_TIER_KEYS hinaus - nie Familien-/Personennamen, Zuhause-Ids, E-Mails, Adressen. Erinnerungen fremder Tiere
// nur freigegeben und nur, solange sie sichtbar sind (PIN_VISIBLE_SQL: Eintrag nicht privat, gehört dem Tier).
// Demo und Echt werden nie gemischt (Ort und fremde Anmeldungen auf derselben is_demo-Seite wie das Zuhause).

const db = require('../db')
const { publicPartnerSql } = require('./partners')
const { findHome } = require('./visits')
const { httpError, checkinsOfHome, ONLY_HOME_MESSAGE } = require('./wirWarenHier')
const { PIN_VISIBLE_SQL, pinsOfCheckin } = require('./wwhPins')

const ORT_TIER_KEYS = Object.freeze(['checkinId', 'tierName', 'tierart', 'fotoUrl', 'erinnerungen'])
const ORT_ERINNERUNG_KEYS = Object.freeze(['titel', 'datum'])
const OTHERS_LIMIT = 200
const PINS_PER_DOG_LIMIT = 20

const NO_SUCH_PLACE_MESSAGE = 'Diesen Ort gibt es nicht'

const placeStmt = db.prepare(`SELECT id, name, typ FROM partners WHERE id = ? AND is_demo = ? AND ${publicPartnerSql()}`)
const othersStmt = db.prepare(
  `SELECT c.id AS checkinId, d.name AS tierName, d.tierart, d.foto_url AS fotoUrl
   FROM wwh_checkins c JOIN dogs d ON d.id = c.dog_id AND d.family_id = c.family_id
   WHERE c.partner_id = @partnerId AND c.status = 'bestaetigt' AND c.zeige_mich = 1
     AND c.family_id != @homeId AND c.is_demo = @isDemo
   ORDER BY d.name COLLATE NOCASE, c.id LIMIT ${OTHERS_LIMIT}`
)
const visiblePinsStmt = db.prepare(
  `SELECT t.titel, t.datum
   FROM wwh_pins p JOIN wwh_checkins c ON c.id = p.checkin_id JOIN timeline_entries t ON t.id = p.entry_id
   WHERE p.checkin_id = ? AND p.status = 'bestaetigt' AND ${PIN_VISIBLE_SQL}
   ORDER BY t.datum DESC, p.id DESC LIMIT ${PINS_PER_DOG_LIMIT}`
)

// Ein fremdes Tier: genau ORT_TIER_KEYS, Erinnerungen genau ORT_ERINNERUNG_KEYS (Felder einzeln übernommen, damit eine
// spätere SQL-Spalte nicht versehentlich mit hinausgeht).
function otherDog(row) {
  const erinnerungen = visiblePinsStmt.all(row.checkinId).map(({ titel, datum }) => ({ titel, datum }))
  return { checkinId: row.checkinId, tierName: row.tierName, tierart: row.tierart, fotoUrl: row.fotoUrl ?? null, erinnerungen }
}

function ownCheckinsAt(homeId, partnerId) {
  return checkinsOfHome(homeId)
    .filter((checkin) => checkin.partnerId === partnerId)
    .map(({ id, dogId, tierName, status, zeigeMich, createdAt }) => ({
      id,
      dogId,
      tierName,
      status,
      zeigeMich,
      createdAt,
      erinnerungen: pinsOfCheckin(homeId, id)
    }))
}

// { ort: { id, name, typ }, eigene: [...], andere: [{ checkinId, tierName, tierart, fotoUrl, erinnerungen: [{ titel, datum }] }] }
// 400 außerhalb eines Zuhauses, 404 für unbekannte, gesperrte, pausierte oder Demo-fremde Orte.
function ortViewForHome(homeId, partnerId) {
  const home = findHome(homeId)
  if (!home) throw httpError(400, ONLY_HOME_MESSAGE)
  const isDemo = home.is_demo ? 1 : 0
  const place = Number.isInteger(partnerId) ? placeStmt.get(partnerId, isDemo) : null
  if (!place) throw httpError(404, NO_SUCH_PLACE_MESSAGE)
  return {
    ort: { id: place.id, name: place.name, typ: place.typ },
    eigene: ownCheckinsAt(homeId, place.id),
    andere: othersStmt.all({ partnerId: place.id, homeId, isDemo }).map(otherDog)
  }
}

module.exports = { ORT_TIER_KEYS, ORT_ERINNERUNG_KEYS, ortViewForHome }
