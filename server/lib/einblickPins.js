'use strict'

// Phase V1: angepinnte Einblicke (partner_einblicke.angepinnt_von/angepinnt_at, db.js). Auf der Partner-Karte in
// "Entdecken" stehen die angepinnten Einblicke - oder, wenn keiner angepinnt ist, die neuesten drei. Der Partner pinnt
// in seinem Bereich (routes/partnerArea/einblicke.js), der Admin in der Partnerpflege (routes/admin.js); der Admin
// überstimmt: seine Pins stehen zuerst, und lösen kann sie nur er. Ausgeblendete Einblicke erscheinen nie.

const db = require('../db')
const { publicEinblick } = require('./einblicke')

const MAX_ANGEPINNT = 3
const CARD_EINBLICKE = 3
const PIN_VON = Object.freeze({ partner: 'partner', admin: 'admin' })
const FULL_MESSAGE = `Höchstens ${MAX_ANGEPINNT} Einblicke angepinnt – löst zuerst einen anderen.`
const ADMIN_FULL_MESSAGE = `Höchstens ${MAX_ANGEPINNT} vom Team angepinnte Einblicke je Partner.`
const TEAM_PIN_MESSAGE = 'Diesen Einblick hat das Team angepinnt – lösen kann ihn nur das Team.'
const HIDDEN_MESSAGE = 'Ausgeblendete Einblicke lassen sich nicht anpinnen.'

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

const findStmt = db.prepare('SELECT * FROM partner_einblicke WHERE id = ?')
// Gezählt werden nur sichtbare Pins - ein vom Admin ausgeblendeter, angepinnter Einblick blockiert keinen Platz.
const countPinsStmt = db.prepare(
  'SELECT COUNT(*) AS c FROM partner_einblicke WHERE partner_id = ? AND ausgeblendet = 0 AND angepinnt_von IS NOT NULL'
)
const countAdminPinsStmt = db.prepare(
  `SELECT COUNT(*) AS c FROM partner_einblicke WHERE partner_id = ? AND ausgeblendet = 0 AND angepinnt_von = '${PIN_VON.admin}'`
)
// Millisekunden: zwei Pins kurz nacheinander bleiben unterscheidbar (angepinnt_at ist nur Verlauf, die Karte ordnet
// nach Datum).
const setPinStmt = db.prepare("UPDATE partner_einblicke SET angepinnt_von = ?, angepinnt_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?")
const clearPinStmt = db.prepare('UPDATE partner_einblicke SET angepinnt_von = NULL, angepinnt_at = NULL WHERE id = ?')

// Partner pinnt (in EINER Transaktion mit der Zählung): schon angepinnt - auch vom Team - bleibt, wie es ist.
// Höchstens MAX_ANGEPINNT Pins insgesamt (Team-Pins zählen mit), ausgeblendete gar nicht.
const pinByPartner = db.transaction((einblickId) => {
  const einblick = findStmt.get(einblickId)
  if (einblick.angepinnt_von) return einblick
  if (einblick.ausgeblendet) throw httpError(409, HIDDEN_MESSAGE)
  if (countPinsStmt.get(einblick.partner_id).c >= MAX_ANGEPINNT) throw httpError(409, FULL_MESSAGE)
  setPinStmt.run(PIN_VON.partner, einblick.id)
  return findStmt.get(einblick.id)
})

// Partner löst: nur eigene Pins - einen Team-Pin nicht.
function unpinByPartner(einblickId) {
  const einblick = findStmt.get(einblickId)
  if (einblick.angepinnt_von === PIN_VON.admin) throw httpError(409, TEAM_PIN_MESSAGE)
  clearPinStmt.run(einblick.id)
  return findStmt.get(einblick.id)
}

// Admin: angepinnt true übernimmt auch einen Partner-Pin als Team-Pin (höchstens MAX_ANGEPINNT Team-Pins je Partner),
// false löst jeden Pin.
const setAdminPin = db.transaction((einblickId, angepinnt) => {
  const einblick = findStmt.get(einblickId)
  if (!angepinnt) {
    clearPinStmt.run(einblick.id)
    return findStmt.get(einblick.id)
  }
  if (einblick.angepinnt_von === PIN_VON.admin) return einblick
  if (einblick.ausgeblendet) throw httpError(409, HIDDEN_MESSAGE)
  if (countAdminPinsStmt.get(einblick.partner_id).c >= MAX_ANGEPINNT) throw httpError(409, ADMIN_FULL_MESSAGE)
  setPinStmt.run(PIN_VON.admin, einblick.id)
  return findStmt.get(einblick.id)
})

// Die Einblicke aller Karten in EINER Abfrage (keine je Karte): je Partner die sichtbaren, Team-Pins vor Partner-Pins,
// darin nach Datum (neueste zuerst). Hat ein Partner Pins, bleiben nur die angepinnten; sonst die neuesten drei.
// partnerIds kommen als JSON-Liste (json_each), damit die Abfrage EINMAL vorbereitet werden kann.
const cardEinblickeStmt = db.prepare(`
  SELECT id, partner_id, foto_url, datum, text FROM (
    SELECT r.*,
           ROW_NUMBER() OVER (PARTITION BY r.partner_id ORDER BY r.pin_rang, r.datum DESC, r.id DESC) AS rang,
           MIN(r.pin_rang) OVER (PARTITION BY r.partner_id) AS bester_rang
    FROM (
      SELECT e.*, CASE e.angepinnt_von WHEN '${PIN_VON.admin}' THEN 0 WHEN '${PIN_VON.partner}' THEN 1 ELSE 2 END AS pin_rang
      FROM partner_einblicke e
      WHERE e.ausgeblendet = 0 AND e.partner_id IN (SELECT value FROM json_each(?))
    ) r
  )
  WHERE rang <= ${CARD_EINBLICKE} AND (bester_rang = 2 OR pin_rang < 2)
  ORDER BY partner_id, rang
`)

// Map partnerId -> [{ id, fotoUrl, datum, text }] (lib/einblicke.js publicEinblick: öffentlich über /public-media,
// preview: true behält /uploads für die Kundensicht).
function cardEinblicke(partnerIds, { preview = false } = {}) {
  const byPartner = new Map()
  if (!partnerIds.length) return byPartner
  for (const row of cardEinblickeStmt.all(JSON.stringify(partnerIds))) {
    const list = byPartner.get(row.partner_id) || []
    byPartner.set(row.partner_id, [...list, publicEinblick(row, { preview })])
  }
  return byPartner
}

module.exports = {
  MAX_ANGEPINNT,
  CARD_EINBLICKE,
  PIN_VON,
  FULL_MESSAGE,
  ADMIN_FULL_MESSAGE,
  TEAM_PIN_MESSAGE,
  HIDDEN_MESSAGE,
  pinByPartner,
  unpinByPartner,
  setAdminPin,
  cardEinblicke
}
