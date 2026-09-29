'use strict'

// Phase P2 Task 9: Nachrichten aus dem Kontaktformular eines Portals an den Posteingang des Partners
// (Tabelle partner_messages, db.js). Prüfung der Eingaben und alle Abfragen; die Routen stehen in
// routes/partners.js (POST /:slug/contact) und routes/partnerArea/messages.js (Posteingang).
//
// Datenschutz: höchstens RETENTION_DAYS Tage aufbewahrt - jeder Eingang (insertMessage) und jedes Öffnen des
// Posteingangs (listMessages) löscht vorher die älteren Nachrichten dieses Partners, unread zählt sie schon vorher
// nicht mehr mit. Damit auch die Nachrichten eines Partners verschwinden, der seinen Posteingang nie öffnet,
// räumt purgeAllExpiredMessages über alle Partner auf - index.js startet sie beim Hochfahren und danach alle
// 24 Stunden (scheduleMessagePurge). Inhalte und Kontaktdaten landen nie im Log (geloggt wird nur die Anzahl).

const db = require('../db')
const { cleanId } = require('./validate')
const { stripUnsafeChars, validateEmail, validatePhone } = require('./partners')
const { publishableSql } = require('./vermittlung')
const { ART } = require('./areaArt')

const RETENTION_DAYS = 180
const MIN_NACHRICHT_LENGTH = 10
const MAX_NACHRICHT_LENGTH = 2000
const MAX_NAME_LENGTH = 80
// Obergrenze der Liste im Posteingang (neueste zuerst) - unread zählt trotzdem alle.
const MAX_INBOX = 500
const RETENTION_SQL = `datetime('now', '-${RETENTION_DAYS} days')`
const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000
const HTML_RE = /[<>]/

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// --- Prüfung -------------------------------------------------------------------------------------

// Reiner Text: Steuer- und Bidi-Zeichen raus (Zeilenumbrüche nur in der Nachricht), getrimmt, kein HTML.
function cleanPlainText(value, { allowNewline = false } = {}) {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw httpError(400, 'Bitte nur Text eingeben.')
  const text = stripUnsafeChars(value, { allowNewline }).trim()
  if (HTML_RE.test(text)) throw httpError(400, 'Bitte nur reinen Text eingeben (kein HTML).')
  return text
}

function validateNachricht(value) {
  const nachricht = cleanPlainText(value, { allowNewline: true })
  if (nachricht.length < MIN_NACHRICHT_LENGTH || nachricht.length > MAX_NACHRICHT_LENGTH) {
    throw httpError(400, `Die Nachricht muss ${MIN_NACHRICHT_LENGTH} bis ${MAX_NACHRICHT_LENGTH} Zeichen haben.`)
  }
  return nachricht
}

function validateName(value) {
  const name = cleanPlainText(value)
  if (name.length > MAX_NAME_LENGTH) throw httpError(400, `Der Name darf höchstens ${MAX_NAME_LENGTH} Zeichen haben.`)
  return name || null
}

// Ein veröffentlichtes Tier (Steckbrief öffentlich, lib/vermittlung.js PUBLISHABLE_STATUS) aus dem
// Tierheim-Bereich GENAU dieses Partners - sonst gäbe es eine "Anfrage zu" einem fremden Tier.
const findBezugDog = db.prepare(
  `SELECT d.name FROM dogs d JOIN families f ON f.id = d.family_id
   WHERE d.public_slug = ? AND f.partner_id = ? AND f.art = '${ART.tierheim}' AND ${publishableSql('d')}`
)

function validateBezug(bezugSlug, partner) {
  if (bezugSlug === undefined || bezugSlug === null || bezugSlug === '') return null
  const dog = typeof bezugSlug === 'string' ? findBezugDog.get(bezugSlug, partner.id) : undefined
  if (!dog) throw httpError(400, 'Zu diesem Tier gibt es hier keinen Steckbrief.')
  return `Anfrage zu ${dog.name}`
}

// Eingabe des Kontaktformulars -> saubere Spalten. Mindestens E-Mail ODER Telefon, beide im selben Format
// wie die Kontaktdaten der Partner (lib/partners.js validateEmail/validatePhone).
function validateContactMessage(body, partner) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  const nachricht = validateNachricht(input.nachricht)
  const name = validateName(input.name)
  const email = validateEmail(input.email)
  const telefon = validatePhone(input.telefon)
  if (!email && !telefon) throw httpError(400, 'Bitte gebt eine E-Mail-Adresse oder Telefonnummer an, damit ihr eine Antwort bekommt.')
  return { name, email, telefon, bezug: validateBezug(input.bezugSlug, partner), nachricht }
}

// --- Abfragen ------------------------------------------------------------------------------------

const purgeStmt = db.prepare(`DELETE FROM partner_messages WHERE partner_id = ? AND created_at < ${RETENTION_SQL}`)
const purgeAllStmt = db.prepare(`DELETE FROM partner_messages WHERE created_at < ${RETENTION_SQL}`)
const insertStmt = db.prepare(
  `INSERT INTO partner_messages (partner_id, name, email, telefon, bezug, nachricht, gelesen_at, is_demo, created_at)
   VALUES (@partner_id, @name, @email, @telefon, @bezug, @nachricht, @gelesen_at, @is_demo, COALESCE(@created_at, datetime('now')))`
)
const listStmt = db.prepare(
  `SELECT * FROM partner_messages WHERE partner_id = ? AND created_at >= ${RETENTION_SQL}
   ORDER BY created_at DESC, id DESC LIMIT ${MAX_INBOX}`
)
const countUnreadStmt = db.prepare(
  `SELECT COUNT(*) AS n FROM partner_messages WHERE partner_id = ? AND gelesen_at IS NULL AND created_at >= ${RETENTION_SQL}`
)
const findOwnStmt = db.prepare('SELECT * FROM partner_messages WHERE id = ? AND partner_id = ?')
const markReadStmt = db.prepare("UPDATE partner_messages SET gelesen_at = COALESCE(gelesen_at, datetime('now')) WHERE id = ? AND partner_id = ?")
const deleteOwnStmt = db.prepare('DELETE FROM partner_messages WHERE id = ? AND partner_id = ?')

function purgeExpired(partnerId) {
  purgeStmt.run(partnerId)
}

// Alle Nachrichten älter als RETENTION_DAYS, über alle Partner hinweg. Gibt die Anzahl der gelöschten zurück.
function purgeAllExpiredMessages() {
  return purgeAllStmt.run().changes
}

// Ein Lauf, der den Server nie mitreißt: Fehler werden abgefangen. Geloggt wird nur die Anzahl bzw. die
// Fehlermeldung der Datenbank - nie Inhalte oder Kontaktdaten.
function runMessagePurge(logger = console) {
  try {
    const count = purgeAllExpiredMessages()
    if (count > 0) logger.log(`Kontaktnachrichten älter als ${RETENTION_DAYS} Tage gelöscht: ${count}`)
    return count
  } catch (err) {
    logger.error(`Aufräumen der Kontaktnachrichten fehlgeschlagen: ${err.message}`)
    return 0
  }
}

// Einmal sofort, danach alle 24 Stunden. unref(): der Timer hält den Prozess nicht am Leben. Nur aus index.js
// (wenn der Server lauscht) aufrufen, nie beim require von app.js - Tests bleiben so ohne Timer.
function scheduleMessagePurge(logger = console) {
  runMessagePurge(logger)
  return setInterval(() => runMessagePurge(logger), PURGE_INTERVAL_MS).unref()
}

// Aufräumen und Speichern in EINER Transaktion. is_demo folgt dem Partner. gelesenAt/createdAt nur für den
// Demo-Aufbau (lib/demoPartnerAreas.js) - das Kontaktformular setzt beides nie.
const insertMessage = db.transaction((partner, clean, { gelesenAt = null, createdAt = null } = {}) => {
  purgeExpired(partner.id)
  return insertStmt.run({ ...clean, partner_id: partner.id, gelesen_at: gelesenAt, is_demo: partner.is_demo ? 1 : 0, created_at: createdAt })
    .lastInsertRowid
})

function listMessages(partnerId) {
  purgeExpired(partnerId)
  return listStmt.all(partnerId)
}

function countUnread(partnerId) {
  return countUnreadStmt.get(partnerId).n
}

// Nur eigene Nachrichten; fremde oder unbekannte -> undefined (die Route antwortet 404). Zweimal lesen lässt
// den ersten Zeitpunkt stehen.
function markRead(partnerId, id) {
  const messageId = cleanId(id)
  if (!messageId || !markReadStmt.run(messageId, partnerId).changes) return undefined
  return findOwnStmt.get(messageId, partnerId)
}

function deleteMessage(partnerId, id) {
  const messageId = cleanId(id)
  return Boolean(messageId) && deleteOwnStmt.run(messageId, partnerId).changes > 0
}

// --- Antworten -----------------------------------------------------------------------------------

function ownMessage(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    telefon: row.telefon,
    bezug: row.bezug,
    nachricht: row.nachricht,
    gelesen: row.gelesen_at !== null,
    gelesenAt: row.gelesen_at,
    createdAt: row.created_at
  }
}

module.exports = {
  RETENTION_DAYS,
  PURGE_INTERVAL_MS,
  purgeAllExpiredMessages,
  runMessagePurge,
  scheduleMessagePurge,
  MIN_NACHRICHT_LENGTH,
  MAX_NACHRICHT_LENGTH,
  MAX_NAME_LENGTH,
  validateContactMessage,
  insertMessage,
  listMessages,
  countUnread,
  markRead,
  deleteMessage,
  ownMessage
}
