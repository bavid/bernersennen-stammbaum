'use strict'

// Phase V1: die Anzeigen auf der Partner-Karte in "Entdecken" (routes/discover.js). Auf der Karte stehen bis zu drei
// freigegebene Empfehlungen des Partners aus dem Bereich seiner Karte - eigene Beiträge UND vom Admin verknüpfte
// ("vom Team"). Der Partner legt in seinem Bereich (routes/partnerArea/posts.js) die Reihenfolge fest
// (promotions.partner_reihenfolge) und welche auf der Karte erscheinen (promotions.in_entdecken; aus = nur auf dem
// Portal). Beides ist reine Darstellung: keine neue Freigabe, kein Eintrag im Verlauf.

const db = require('../db')
const { cleanId } = require('./validate')
const { FREIGABE, promotionActiveSql } = require('./promotions')

const CARD_ANZEIGEN = 3
const MAX_ORDER_IDS = 50
const ORDER_MESSAGE = 'Ordnen lassen sich nur freigegebene Anzeigen eurer Karte, jede einmal.'
const IN_ENTDECKEN_MESSAGE = '„inEntdecken“ muss true oder false sein'
const NOT_FOUND_MESSAGE = 'Diese Anzeige gibt es auf eurer Karte nicht'

// Bereich der Partner-Karte je Partner-Typ - wie die Abschnitte in routes/discover.js (HUNDESCHULEN_TYPS, SALON_TYPS,
// BEGLEITER_TYPS). futter/sonstige haben in "Entdecken" keine Partner-Karte.
const CARD_BEREICH_BY_TYP = Object.freeze({
  hundeschule: 'hundeschule',
  hundesalon: 'salon',
  betreuung: 'salon',
  tierheim: 'begleiter',
  vermittlung: 'begleiter'
})

const SQL_ALIAS_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// Karten-Reihenfolge: die vom Partner geordneten zuerst (1, 2, …), danach die übrigen nach sort (Admin), neueste zuerst.
// Dieselbe Reihenfolge gilt auf dem Portal (lib/partnerPosts.js) und in der Kundensicht.
function cardOrderSql(alias) {
  if (!SQL_ALIAS_RE.test(alias)) throw new Error('Ungültiger Tabellen-Alias für die Karten-Reihenfolge')
  return `(${alias}.partner_reihenfolge IS NULL), ${alias}.partner_reihenfolge, ${alias}.sort, ${alias}.created_at DESC, ${alias}.id DESC`
}

function compareCardOrder(a, b) {
  const aOrdered = a.partner_reihenfolge !== null && a.partner_reihenfolge !== undefined
  const bOrdered = b.partner_reihenfolge !== null && b.partner_reihenfolge !== undefined
  if (aOrdered !== bOrdered) return aOrdered ? -1 : 1
  if (aOrdered && a.partner_reihenfolge !== b.partner_reihenfolge) return a.partner_reihenfolge - b.partner_reihenfolge
  if (a.sort !== b.sort) return a.sort - b.sort
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1
  return b.id - a.id
}

// Zeilen (schon aktiv, freigegeben, sichtbar - routes/discover.js activePromotionRows) -> Map partnerId -> die bis zu
// CARD_ANZEIGEN Zeilen seiner Karte, in Karten-Reihenfolge, ohne die "nur auf dem Portal".
function groupCardAnzeigen(rows, partnerIds) {
  const wanted = new Set(partnerIds)
  const byPartner = new Map()
  for (const row of rows) {
    if (!wanted.has(row.partner_id) || !row.in_entdecken) continue
    byPartner.set(row.partner_id, [...(byPartner.get(row.partner_id) || []), row])
  }
  return new Map([...byPartner].map(([partnerId, list]) => [partnerId, list.slice().sort(compareCardOrder).slice(0, CARD_ANZEIGEN)]))
}

// --- Partner-Bereich -----------------------------------------------------------------------------

// Alle freigegebenen Empfehlungen des Partners im Bereich seiner Karte, in Karten-Reihenfolge - auch inaktive oder
// außerhalb ihres Zeitraums (sichtbar = 0), damit der Partner sie schon vorher einordnen kann.
const candidatesStmt = db.prepare(
  `SELECT m.*, (${promotionActiveSql('m')}) AS sichtbar FROM promotions m
   WHERE m.partner_id = ? AND m.bereich = ? AND m.freigabe = '${FREIGABE.freigegeben}'
   ORDER BY ${cardOrderSql('m')}`
)
const clearOrderStmt = db.prepare('UPDATE promotions SET partner_reihenfolge = NULL WHERE partner_id = ? AND bereich = ?')
const setOrderStmt = db.prepare('UPDATE promotions SET partner_reihenfolge = ? WHERE id = ?')
const setInEntdeckenStmt = db.prepare('UPDATE promotions SET in_entdecken = ? WHERE id = ?')

function cardBereich(partner) {
  return CARD_BEREICH_BY_TYP[partner.typ] || null
}

function listCandidates(partner) {
  const bereich = cardBereich(partner)
  return bereich ? candidatesStmt.all(partner.id, bereich) : []
}

// Antwort für GET/PUT: { bereich, max, anzeigen } - aufKarte: steht gerade auf der Karte (eine der ersten drei, die
// gezeigt werden sollen und aktiv sind).
function entdeckenAnzeigen(partner) {
  let shown = 0
  const anzeigen = listCandidates(partner).map((row) => {
    const aufKarte = Boolean(row.in_entdecken && row.sichtbar) && shown < CARD_ANZEIGEN
    if (aufKarte) shown += 1
    return {
      id: row.id,
      titel: row.titel,
      text: row.text,
      kennzeichnung: row.kennzeichnung,
      reihenfolge: row.partner_reihenfolge ?? null,
      inEntdecken: Boolean(row.in_entdecken),
      sichtbar: Boolean(row.sichtbar),
      vomTeam: !row.erstellt_von_partner,
      aufKarte
    }
  })
  return { bereich: cardBereich(partner), max: CARD_ANZEIGEN, anzeigen }
}

// { ids: [...] } -> geprüfte, eindeutige Ids aus den Anzeigen der eigenen Karte, sonst 400.
function validateOrderIds(body, candidates) {
  const ids = body && typeof body === 'object' ? body.ids : undefined
  if (!Array.isArray(ids) || ids.length > MAX_ORDER_IDS) throw httpError(400, ORDER_MESSAGE)
  const known = new Set(candidates.map((row) => row.id))
  const cleaned = ids.map((value) => (typeof value === 'number' ? cleanId(value) : NaN))
  if (!cleaned.every((id) => known.has(id)) || new Set(cleaned).size !== cleaned.length) throw httpError(400, ORDER_MESSAGE)
  return cleaned
}

// Die genannten Anzeigen bekommen 1, 2, 3 …, alle übrigen der Karte (auch noch eingereichte) wieder keine eigene Stelle.
const setReihenfolge = db.transaction((partner, body) => {
  const ids = validateOrderIds(body, listCandidates(partner))
  const bereich = cardBereich(partner)
  if (bereich) clearOrderStmt.run(partner.id, bereich)
  ids.forEach((id, index) => setOrderStmt.run(index + 1, id))
  return entdeckenAnzeigen(partner)
})

// "in Entdecken zeigen" für eine Anzeige der eigenen Karte - unbekannt, fremd oder nicht freigegeben -> 404.
function setInEntdecken(partner, id, body) {
  const inEntdecken = body && typeof body === 'object' ? body.inEntdecken : undefined
  if (typeof inEntdecken !== 'boolean') throw httpError(400, IN_ENTDECKEN_MESSAGE)
  const postId = cleanId(id)
  if (!listCandidates(partner).some((row) => row.id === postId)) throw httpError(404, NOT_FOUND_MESSAGE)
  setInEntdeckenStmt.run(inEntdecken ? 1 : 0, postId)
  return entdeckenAnzeigen(partner)
}

module.exports = {
  CARD_ANZEIGEN,
  CARD_BEREICH_BY_TYP,
  cardOrderSql,
  compareCardOrder,
  groupCardAnzeigen,
  entdeckenAnzeigen,
  setReihenfolge,
  setInEntdecken
}
