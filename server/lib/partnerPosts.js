'use strict'

// Phase P2 Task 8: Beiträge der Partner - ein Partner legt in seinem Bereich eigene Anzeigen für "Entdecken"
// und sein Portal an. Sie liegen in promotions (erstellt_von_partner = 1), tragen IMMER die Kennzeichnung
// "Anzeige" und werden erst nach Freigabe durch den Admin öffentlich (promotions.freigabe,
// routes/adminMarketing.js). Prüfung und Abfragen hier; die Routen stehen in routes/partnerArea/posts.js
// (Partner), routes/partners.js (Portal) und routes/partnerArea/preview.js (Kundensicht).

const db = require('../db')
const { cleanId } = require('./validate')
const {
  validatePromotion,
  promotionActiveSql,
  promotionClicksJoinSql,
  promotionImageUrl,
  PROMOTION_CLICKS_COLUMNS_SQL,
  FREIGABE
} = require('./promotions')
const { VERLAUF_AKTION, PARTNER_VERLAUF_LIMIT, recordPromotionEvent, promotionVerlauf, partnerEditOutcome } = require('./promotionFreigabe')
const { cardOrderSql } = require('./partnerPostOrder')

const ANZEIGE = 'Anzeige'
const MAX_POSTS = 20
const MAX_PUBLIC_POSTS = 10
// SQLite: LIMIT -1 = ohne Grenze (Kundensicht von "Entdecken" zeigt wie dort alle Beiträge).
const NO_LIMIT = -1
const LIMIT_MESSAGE = `Höchstens ${MAX_POSTS} Beiträge – bitte ältere löschen.`
const BEREICH_MESSAGE = 'Dieser Bereich passt nicht zu eurem Partner-Typ.'
const NOT_FOUND_MESSAGE = 'Diesen Beitrag gibt es nicht'
const HTML_MESSAGE = 'Titel und Text dürfen nur reinen Text enthalten (kein HTML).'
const HTML_RE = /[<>]/

// Was ein Partner selbst angeben darf - alles andere (kennzeichnung, empfohlenVon, partnerId, sort, is_demo,
// freigabe, ...) wird stillschweigend übergangen und serverseitig gesetzt.
const EDITABLE_FIELDS = ['titel', 'text', 'bereich', 'url', 'start', 'ende', 'tierart', 'aktiv']

// Erlaubte Bereiche je Partner-Typ (lib/partners.js TYP_VALUES). salon hat ab Task 9 einen eigenen Abschnitt.
const BEREICHE_BY_TYP = Object.freeze({
  hundeschule: ['hundeschule'],
  hundesalon: ['salon'],
  betreuung: ['salon'],
  tierheim: ['begleiter', 'unterstuetzen'],
  vermittlung: ['begleiter', 'unterstuetzen'],
  futter: ['futter'],
  sonstige: ['unterstuetzen', 'futter']
})

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// --- Prüfung -------------------------------------------------------------------------------------

// Ein Beitrag eines Partners ist immer eine Anzeige ohne "Empfehlung von" - auch wenn der Admin ihn ändert
// (routes/adminMarketing.js). partnerId: null, weil den Partner nie die Eingabe bestimmt.
function asPartnerPostInput(input) {
  return { ...input, kennzeichnung: ANZEIGE, empfohlenVon: null, partnerId: null }
}

// Eingabe des Partners -> saubere Spalten (bereich, kennzeichnung, empfohlen_von, titel, text, url, tierart,
// aktiv, start, ende). Bereich zuerst gegen den Partner-Typ, danach dieselbe Prüfung wie beim Admin
// (lib/promotions.js validatePromotion: Züchter-Schutz, Link nur http(s), Datumsangaben, Längen).
function validatePartnerPost(body, partner) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  const allowed = BEREICHE_BY_TYP[partner.typ] || []
  if (!allowed.includes(input.bereich)) throw httpError(400, BEREICH_MESSAGE)

  const picked = Object.fromEntries(EDITABLE_FIELDS.filter((field) => Object.hasOwn(input, field)).map((field) => [field, input[field]]))
  // partner_id und sort gehören nicht dem Partner: partner_id setzt der Aufrufer, sort pflegt nur der Admin.
  const { partner_id: _partnerId, sort: _sort, ...clean } = validatePromotion(asPartnerPostInput(picked))
  // Wie Portal-Text (lib/partners.js) und Einblicke (lib/einblicke.js): Texte von Partnern sind reiner Text.
  if (HTML_RE.test(clean.titel) || HTML_RE.test(clean.text || '')) throw httpError(400, HTML_MESSAGE)
  return clean
}

// --- Abfragen ------------------------------------------------------------------------------------

const OWN_POSTS_SQL = `SELECT p.*, ${PROMOTION_CLICKS_COLUMNS_SQL} FROM promotions p ${promotionClicksJoinSql('p')}
   WHERE p.partner_id = ? AND p.erstellt_von_partner = 1`
const listOwnPostsStmt = db.prepare(`${OWN_POSTS_SQL} ORDER BY p.created_at DESC, p.id DESC`)
const findOwnPostStmt = db.prepare(`${OWN_POSTS_SQL} AND p.id = ?`)
const countOwnPostsStmt = db.prepare('SELECT COUNT(*) AS n FROM promotions WHERE partner_id = ? AND erstellt_von_partner = 1')
// Freigabe UND der Schalter "vertrauenswürdig" frisch aus der Datenbank - ein langsamer Bild-Upload trägt sonst noch den
// Partner vom Anfang der Anfrage (middleware/partnerArea.js), auch wenn der Admin den Schalter inzwischen umgelegt hat.
const findOwnFreigabeStmt = db.prepare(
  `SELECT p.freigabe, pa.vertrauenswuerdig FROM promotions p JOIN partners pa ON pa.id = p.partner_id
   WHERE p.id = ? AND p.partner_id = ? AND p.erstellt_von_partner = 1`
)

const insertPostStmt = db.prepare(
  `INSERT INTO promotions (partner_id, bereich, kennzeichnung, empfohlen_von, titel, text, url, tierart, aktiv, start, ende,
                           is_demo, erstellt_von_partner, freigabe, ablehnungsgrund)
   VALUES (@partner_id, @bereich, @kennzeichnung, @empfohlen_von, @titel, @text, @url, @tierart, @aktiv, @start, @ende,
           @is_demo, 1, '${FREIGABE.eingereicht}', NULL)`
)
// Die Felder einer Änderung - die Freigabe setzt applyPartnerEdit danach. sort bleibt, wie der Admin es gesetzt hat.
const updatePostStmt = db.prepare(
  `UPDATE promotions SET bereich = @bereich, kennzeichnung = @kennzeichnung, empfohlen_von = @empfohlen_von, titel = @titel,
          text = @text, url = @url, tierart = @tierart, aktiv = @aktiv, start = @start, ende = @ende
   WHERE id = @id`
)
// Jede Änderung nimmt einen Ablehnungsgrund weg (ein freigegebener Beitrag hat ohnehin keinen).
const setPartnerFreigabeStmt = db.prepare('UPDATE promotions SET freigabe = ?, ablehnungsgrund = NULL WHERE id = ?')

// Beiträge eines Partners, wie Kundinnen und Kunden sie sehen: aktiv, im Zeitfenster, in einer der
// gewünschten Freigaben - in der Reihenfolge der Partner-Karte (Phase V1, lib/partnerPostOrder.js: erst die vom
// Partner geordneten, dann nach sort, neueste zuerst). Alle Empfehlungen mit dieser partner_id, auch die
// vom Admin verknüpften (erstellt_von_partner = 0): das Portal zeigt "die Beiträge des Partners".
// freigaben sind feste Werte aus FREIGABE, nie Eingaben.
function shownPostsSql(freigaben) {
  return `SELECT m.* FROM promotions m
   WHERE m.partner_id = ? AND ${promotionActiveSql('m')} AND m.freigabe IN (${freigaben.map((value) => `'${value}'`).join(', ')})
   ORDER BY ${cardOrderSql('m')}
   LIMIT ?`
}
const listPublicPostsStmt = db.prepare(shownPostsSql([FREIGABE.freigegeben]))
const listPreviewPostsStmt = db.prepare(shownPostsSql([FREIGABE.eingereicht, FREIGABE.freigegeben]))

function listOwnPosts(partnerId) {
  return listOwnPostsStmt.all(partnerId)
}

function findOwnPost(partnerId, id) {
  const postId = cleanId(id)
  return postId ? findOwnPostStmt.get(partnerId, postId) : undefined
}

// Limit, Einfügen und der erste Eintrag im Verlauf (eingereicht) in EINER Transaktion - zwei gleichzeitige Anfragen
// kommen so nicht gemeinsam über 20. Neue Beiträge brauchen immer die Freigabe, auch bei vertrauenswürdigen Partnern.
const insertPost = db.transaction((partner, clean) => {
  if (countOwnPostsStmt.get(partner.id).n >= MAX_POSTS) throw httpError(409, LIMIT_MESSAGE)
  const id = insertPostStmt.run({ ...clean, partner_id: partner.id, is_demo: partner.is_demo ? 1 : 0 }).lastInsertRowid
  recordPromotionEvent(id, VERLAUF_AKTION.eingereicht)
  return findOwnPostStmt.get(partner.id, id)
})

// V-Fehler 3: eine Änderung durch den Partner - Text (PUT, clean) oder Bild (clean = null, das Bild hat
// lib/promotionImage.js in derselben Transaktion schon gesetzt). Freigabe nach partnerEditOutcome
// (lib/promotionFreigabe.js: vertrauenswürdig und freigegeben bleibt online, sonst zur Prüfung) und ein Eintrag im
// Verlauf - alles in EINER Transaktion mit frisch gelesener Freigabe und frisch gelesenem Vertrauen. Gibt das Ergebnis
// von partnerEditOutcome zurück oder null, wenn es den eigenen Beitrag nicht (mehr) gibt.
const applyPartnerEdit = db.transaction((partner, id, clean = null) => {
  const current = findOwnFreigabeStmt.get(id, partner.id)
  if (!current) return null
  const outcome = partnerEditOutcome({ vertrauenswuerdig: current.vertrauenswuerdig }, current.freigabe)
  if (clean) updatePostStmt.run({ ...clean, id })
  setPartnerFreigabeStmt.run(outcome.freigabe, id)
  recordPromotionEvent(id, outcome.aktion)
  return outcome
})

function updatePost(partner, id, clean) {
  return applyPartnerEdit(partner, id, clean)
}

// Portal (GET /api/public/partners/:slug/posts): nur freigegebene, höchstens MAX_PUBLIC_POSTS.
function listPublicPosts(partnerId) {
  return listPublicPostsStmt.all(partnerId, MAX_PUBLIC_POSTS)
}

// Kundensicht des Partners: dazu die eingereichten (abgelehnte nie). limit: MAX_PUBLIC_POSTS wie das Portal
// oder NO_LIMIT wie "Entdecken".
function listPreviewPosts(partnerId, limit) {
  return listPreviewPostsStmt.all(partnerId, limit)
}

// --- Antworten -----------------------------------------------------------------------------------

// Der eigene Beitrag in camelCase (wie die Einblicke, lib/einblicke.js ownEinblick), mit Freigabe,
// Ablehnungsgrund, Klickzahlen und (V-Fehler 3) den letzten Einträgen im Verlauf, älteste zuerst.
function ownPost(row, verlauf = []) {
  return {
    id: row.id,
    bereich: row.bereich,
    kennzeichnung: row.kennzeichnung,
    titel: row.titel,
    text: row.text,
    url: row.url,
    tierart: row.tierart,
    aktiv: Boolean(row.aktiv),
    start: row.start,
    ende: row.ende,
    bildUrl: promotionImageUrl(row.bild_file),
    freigabe: row.freigabe,
    ablehnungsgrund: row.ablehnungsgrund,
    clicks7: row.clicks7,
    clicksTotal: row.clicksTotal,
    createdAt: row.created_at,
    verlauf
  }
}

// Ein einzelner eigener Beitrag samt Verlauf (Antwort auf POST, PUT und Bild).
function ownPostWithVerlauf(row) {
  return ownPost(row, promotionVerlauf(row.id, PARTNER_VERLAUF_LIMIT))
}

module.exports = {
  ANZEIGE,
  MAX_POSTS,
  MAX_PUBLIC_POSTS,
  NO_LIMIT,
  LIMIT_MESSAGE,
  BEREICH_MESSAGE,
  NOT_FOUND_MESSAGE,
  BEREICHE_BY_TYP,
  asPartnerPostInput,
  validatePartnerPost,
  listOwnPosts,
  findOwnPost,
  insertPost,
  updatePost,
  applyPartnerEdit,
  listPublicPosts,
  listPreviewPosts,
  ownPost,
  ownPostWithVerlauf
}
