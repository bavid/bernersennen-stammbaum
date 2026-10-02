'use strict'

// V-Fehler 3 (docs/superpowers/plans/2026-09-30-phase-v-freunde-partner-kalender.md): Freigabe-Verwaltung der
// Beiträge. Der Verlauf je Beitrag (Tabelle promotion_events, db.js), die Entscheidungen des Admins - einzeln und
// gesammelt (routes/adminMarketing.js) -, Ablehnungsgründe als Vorlagen und die Regel, was eine Änderung durch den
// Partner mit der Freigabe macht (partnerEditOutcome, genutzt von lib/partnerPosts.js) - samt vertrauenswürdiger
// Partner (partners.vertrauenswuerdig, setzt nur der Admin).

const db = require('../db')
const { cleanId } = require('./validate')
const { FREIGABE, validateAblehnungsgrund, cleanTextInput } = require('./promotions')

// eingereicht: neu oder erneut zur Prüfung. geaendert: geändert, ohne dass sich die Freigabe ändert (liegt schon
// zur Prüfung oder vertrauenswürdig und schon online). zurueckgezogen: vorgesehen für eine zurückgezogene
// Einreichung - heute schreibt noch keine Aktion diesen Wert, der Verlauf zeigt ihn aber schon an.
const VERLAUF_AKTION = Object.freeze({
  eingereicht: 'eingereicht',
  geaendert: 'geaendert',
  freigegeben: 'freigegeben',
  abgelehnt: 'abgelehnt',
  zurueckgezogen: 'zurueckgezogen'
})
const VERLAUF_AKTION_VALUES = Object.values(VERLAUF_AKTION)

// Der Partner sieht die letzten PARTNER_VERLAUF_LIMIT Einträge je Beitrag, der Admin bis zu ADMIN_VERLAUF_LIMIT.
const PARTNER_VERLAUF_LIMIT = 10
const ADMIN_VERLAUF_LIMIT = 50
const MAX_SAMMEL_IDS = 50
const ENTSCHIEDEN_LIMIT = 30

// Ablehnungsgründe als Vorlagen (Admin "Freigaben", client/src/lib/adminApproval.js spiegelt die Liste). Gespeichert
// wird reiner Text in promotions.ablehnungsgrund: "Vorlage – Zusatz" bzw. nur der Zusatz bei "Sonstiges".
const SONSTIGES = 'Sonstiges'
const ABLEHNUNG_VORLAGEN = Object.freeze([
  'Gesundheitsversprechen',
  'Kennzeichnung unklar',
  'Bild passt nicht / Rechte unklar',
  'Link führt ins Leere',
  'Kein Bezug zu Tieren',
  SONSTIGES
])
const VORLAGE_TRENNER = ' – '

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// --- Verlauf -------------------------------------------------------------------------------------

const insertEventStmt = db.prepare(
  "INSERT INTO promotion_events (promotion_id, aktion, grund, created_at) VALUES (?, ?, ?, COALESCE(?, datetime('now')))"
)
const latestEventsStmt = db.prepare(
  `SELECT id, aktion, grund, created_at FROM (
     SELECT id, aktion, grund, created_at FROM promotion_events WHERE promotion_id = ? ORDER BY created_at DESC, id DESC LIMIT ?
   ) ORDER BY created_at, id`
)
// Die letzten PARTNER_VERLAUF_LIMIT Einträge aller eigenen Beiträge eines Partners in EINER Abfrage.
const partnerEventsStmt = db.prepare(
  `SELECT promotion_id, id, aktion, grund, created_at FROM (
     SELECT e.*, ROW_NUMBER() OVER (PARTITION BY e.promotion_id ORDER BY e.created_at DESC, e.id DESC) AS rang
     FROM promotion_events e JOIN promotions p ON p.id = e.promotion_id
     WHERE p.partner_id = ? AND p.erstellt_von_partner = 1
   ) WHERE rang <= ? ORDER BY promotion_id, created_at, id`
)

// createdAt nur für den Demo-Seed (lib/demoPartnerAreas.js) - sonst gilt "jetzt".
function recordPromotionEvent(promotionId, aktion, { grund = null, createdAt = null } = {}) {
  if (!VERLAUF_AKTION_VALUES.includes(aktion)) throw new Error(`Unbekannte Aktion im Verlauf: ${aktion}`)
  insertEventStmt.run(promotionId, aktion, grund, createdAt)
}

function verlaufEvent(row) {
  return { id: row.id, aktion: row.aktion, grund: row.grund, createdAt: row.created_at }
}

// Die letzten limit Einträge eines Beitrags, älteste zuerst.
function promotionVerlauf(promotionId, limit = ADMIN_VERLAUF_LIMIT) {
  return latestEventsStmt.all(promotionId, limit).map(verlaufEvent)
}

// Map promotion_id -> Verlauf (älteste zuerst) für die Beitragsliste des Partners.
function partnerVerlaufById(partnerId) {
  const byId = new Map()
  for (const row of partnerEventsStmt.all(partnerId, PARTNER_VERLAUF_LIMIT)) {
    if (!byId.has(row.promotion_id)) byId.set(row.promotion_id, [])
    byId.get(row.promotion_id).push(verlaufEvent(row))
  }
  return byId
}

// --- Änderungen durch den Partner ------------------------------------------------------------------

const LIVE_EDIT = Object.freeze({ freigabe: FREIGABE.freigegeben, aktion: VERLAUF_AKTION.geaendert, live: true })
const PENDING_EDIT = Object.freeze({ freigabe: FREIGABE.eingereicht, aktion: VERLAUF_AKTION.geaendert, live: false })
const RESUBMIT = Object.freeze({ freigabe: FREIGABE.eingereicht, aktion: VERLAUF_AKTION.eingereicht, live: false })

// Was eine Änderung (Text oder Bild) mit der Freigabe macht: ein freigegebener Beitrag eines vertrauenswürdigen
// Partners bleibt online (geaendert, live); ein eingereichter bleibt zur Prüfung (geaendert); alles andere -
// freigegeben ohne Vertrauen, abgelehnt - kommt erneut zur Prüfung (eingereicht). Neue Beiträge brauchen immer
// die Freigabe (lib/partnerPosts.js insertPost).
function partnerEditOutcome(partner, freigabe) {
  if (freigabe === FREIGABE.freigegeben && partner.vertrauenswuerdig) return LIVE_EDIT
  if (freigabe === FREIGABE.eingereicht) return PENDING_EDIT
  return RESUBMIT
}

// --- Entscheidungen des Admins -------------------------------------------------------------------

const findFreigabeStmt = db.prepare('SELECT id, freigabe FROM promotions WHERE id = ?')
const setFreigabeStmt = db.prepare('UPDATE promotions SET freigabe = ?, ablehnungsgrund = ? WHERE id = ?')

// false, wenn es den Beitrag nicht gibt. Freigeben räumt einen Ablehnungsgrund weg; ein schon freigegebener
// Beitrag bekommt keinen zweiten Eintrag im Verlauf.
const approvePromotion = db.transaction((id) => {
  const row = findFreigabeStmt.get(id)
  if (!row) return false
  setFreigabeStmt.run(FREIGABE.freigegeben, null, id)
  if (row.freigabe !== FREIGABE.freigegeben) recordPromotionEvent(id, VERLAUF_AKTION.freigegeben)
  return true
})

const rejectPromotion = db.transaction((id, grund) => {
  if (!findFreigabeStmt.get(id)) return false
  setFreigabeStmt.run(FREIGABE.abgelehnt, grund, id)
  recordPromotionEvent(id, VERLAUF_AKTION.abgelehnt, { grund })
  return true
})

// Ids für POST /api/admin/promotions/freigeben: 1 bis MAX_SAMMEL_IDS Zahlen oder Ziffern-Texte, doppelte zählen einmal.
function validateSammelIds(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SAMMEL_IDS) {
    throw httpError(400, `Bitte 1 bis ${MAX_SAMMEL_IDS} Beiträge auswählen`)
  }
  const ids = value.map((id) => (typeof id === 'number' || typeof id === 'string' ? cleanId(id) : NaN))
  if (!ids.every(Number.isInteger)) throw httpError(400, 'Ungültige Beitrags-Id')
  return [...new Set(ids)]
}

// Gibt nur die eingereichten frei - alles in EINER Transaktion. Schon freigegebene, abgelehnte und unbekannte Ids
// zählen als übersprungen.
const approveMany = db.transaction((ids) => {
  const approved = ids.filter((id) => findFreigabeStmt.get(id)?.freigabe === FREIGABE.eingereicht)
  for (const id of approved) {
    setFreigabeStmt.run(FREIGABE.freigegeben, null, id)
    recordPromotionEvent(id, VERLAUF_AKTION.freigegeben)
  }
  return { freigegeben: approved.length, uebersprungen: ids.length - approved.length, ids: approved }
})

// Ablehnungsgrund aus { vorlage, text } (Vorlage aus ABLEHNUNG_VORLAGEN, text optional - bei "Sonstiges" Pflicht)
// oder wie bisher aus { grund } (freier Text). Danach dieselbe Prüfung wie immer (3-300 Zeichen, reiner Text).
function ablehnungsgrundFrom(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  if (input.vorlage === undefined) return validateAblehnungsgrund(input.grund)
  if (!ABLEHNUNG_VORLAGEN.includes(input.vorlage)) throw httpError(400, 'Bitte einen der vorgegebenen Gründe wählen')
  if (input.text !== undefined && input.text !== null && typeof input.text !== 'string') throw httpError(400, 'Der Zusatz zum Grund muss Text sein')
  const text = cleanTextInput(input.text)
  if (input.vorlage === SONSTIGES) {
    if (!text) throw httpError(400, 'Bei „Sonstiges“ bitte den Grund kurz beschreiben')
    return validateAblehnungsgrund(text)
  }
  return validateAblehnungsgrund(text ? `${input.vorlage}${VORLAGE_TRENNER}${text}` : input.vorlage)
}

// "Zuletzt entschieden": Beiträge der Partner, deren letzte Entscheidung (freigegeben/abgelehnt) noch gilt - neueste
// Entscheidung zuerst, höchstens ENTSCHIEDEN_LIMIT. Wer danach erneut einreicht, steht wieder unter "eingereicht".
const decidedStmt = db.prepare(
  `SELECT p.*, pa.name AS partnerName, d.aktion AS entscheidung, d.created_at AS entschiedenAt
   FROM (
     SELECT id, promotion_id, aktion, created_at,
            ROW_NUMBER() OVER (PARTITION BY promotion_id ORDER BY created_at DESC, id DESC) AS rang
     FROM promotion_events WHERE aktion IN ('${VERLAUF_AKTION.freigegeben}', '${VERLAUF_AKTION.abgelehnt}')
   ) d
   JOIN promotions p ON p.id = d.promotion_id AND p.freigabe = d.aktion
   LEFT JOIN partners pa ON pa.id = p.partner_id
   WHERE d.rang = 1 AND p.erstellt_von_partner = 1
   ORDER BY d.created_at DESC, d.id DESC
   LIMIT ?`
)

function listDecidedPromotions() {
  return decidedStmt.all(ENTSCHIEDEN_LIMIT)
}

module.exports = {
  VERLAUF_AKTION,
  VERLAUF_AKTION_VALUES,
  PARTNER_VERLAUF_LIMIT,
  ADMIN_VERLAUF_LIMIT,
  MAX_SAMMEL_IDS,
  ENTSCHIEDEN_LIMIT,
  ABLEHNUNG_VORLAGEN,
  SONSTIGES,
  recordPromotionEvent,
  promotionVerlauf,
  partnerVerlaufById,
  partnerEditOutcome,
  approvePromotion,
  rejectPromotion,
  validateSammelIds,
  approveMany,
  ablehnungsgrundFrom,
  listDecidedPromotions
}
