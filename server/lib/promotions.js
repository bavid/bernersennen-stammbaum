'use strict'

// Empfehlungen/Anzeigen im Reiter "Entdecken" (Phase 3 Task 1) - Admin pflegt sie über
// routes/adminMarketing.js. Nie Züchter: assertNoBreeder prüft Titel, Text und "Empfehlung von" wie
// lib/partners.js es für Partner-Texte tut (docs/superpowers/plans/2026-09-29-phase-3-entdecken.md).

const { stripUnsafeChars, sanitizeExternalUrl, publicPartnerSql } = require('./partners')
const { assertNoBreeder } = require('./breederGuard')
const { isIsoDate, cleanId } = require('./validate')

const MAX_TITEL_LENGTH = 120
const MAX_TEXT_LENGTH = 600
const MAX_EMPFOHLEN_VON_LENGTH = 120
const MAX_URL_LENGTH = 300

// 'salon' (Phase P2 Task 8): Beiträge von Hundesalons und Betreuung - ein eigener Abschnitt in "Entdecken"
// folgt in Task 9, bis dahin wird der Bereich nur geprüft. Muss zum CHECK in db.js passen.
const BEREICH_VALUES = ['futter', 'hundeschule', 'begleiter', 'unterstuetzen', 'salon']
const KENNZEICHNUNG_VALUES = ['Anzeige', 'Empfehlung', 'Partner']
const TIERART_VALUES = ['hund', 'katze', 'anderes']

// Phase P2 Task 8: promotions.freigabe (in db.js bewusst ohne CHECK - geprüft wird hier). Beiträge der
// Partner starten 'eingereicht'; öffentlich erscheint nur 'freigegeben'. Was der Admin anlegt oder ändert,
// ist sofort freigegeben (routes/adminMarketing.js).
const FREIGABE = Object.freeze({ eingereicht: 'eingereicht', freigegeben: 'freigegeben', abgelehnt: 'abgelehnt' })
const FREIGABE_VALUES = Object.values(FREIGABE)
const MIN_ABLEHNUNGSGRUND_LENGTH = 3
const MAX_ABLEHNUNGSGRUND_LENGTH = 300

// Öffentlich zeigen (Entdecken, Klick-Weiterleitung) nur Empfehlungen ohne Partner oder mit einem
// öffentlich sichtbaren Partner (aktiv und nicht gesperrt, lib/partners.js publicPartnerSql) - ein
// gesperrter, pausierter oder Entwurfs-Partner nimmt seine Empfehlungen mit (Review zu Phase P Task 1).
// Ein gelöschter Partner (partner_id ohne Zeile, promotions.partner_id hat bewusst keine REFERENCES)
// zählt ebenfalls als nicht sichtbar. Erwartet einen LEFT JOIN partners <partnerAlias> ON
// <partnerAlias>.id = <promotionAlias>.partner_id im umgebenden Query.
const SQL_ALIAS_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

function assertSqlAlias(...aliases) {
  if (!aliases.every((alias) => SQL_ALIAS_RE.test(alias))) {
    throw new Error('Ungültiger Tabellen-Alias für die Empfehlungs-Abfrage')
  }
}

function promotionPartnerVisibleSql(promotionAlias, partnerAlias) {
  assertSqlAlias(promotionAlias, partnerAlias)
  return `(${promotionAlias}.partner_id IS NULL OR (${publicPartnerSql(partnerAlias)}))`
}

// Öffentlich (Entdecken, /r/promotion/:id): freigegeben UND der Partner sichtbar (siehe oben). Erwartet
// denselben LEFT JOIN partners wie promotionPartnerVisibleSql.
function promotionPublicSql(promotionAlias, partnerAlias) {
  assertSqlAlias(promotionAlias, partnerAlias)
  return `(${promotionAlias}.freigabe = '${FREIGABE.freigegeben}' AND ${promotionPartnerVisibleSql(promotionAlias, partnerAlias)})`
}

// Aktiv und im Zeitfenster (start/ende NULL = offen) - für Entdecken, das Portal und die Kundensicht.
function promotionActiveSql(promotionAlias) {
  assertSqlAlias(promotionAlias)
  const a = promotionAlias
  return `(${a}.aktiv = 1 AND (${a}.start IS NULL OR ${a}.start <= date('now')) AND (${a}.ende IS NULL OR ${a}.ende >= date('now')))`
}

// Phase 3 Task 5: Klickzahlen je Empfehlung in EINER aggregierten Abfrage (kein N+1) - clicks7 zählt die
// letzten 7 Tage inklusive heute (tag >= date('now', '-6 days'); tag schreibt routes/redirect.js als
// date('now'), also UTC), clicksTotal alle Tage. Nur target_type 'promotion'; ohne Klicks 0/0. Gemeinsam
// für die Admin-Liste und die eigenen Beiträge der Partner (lib/partnerPosts.js): den JOIN hinter FROM
// promotions <promotionAlias>, die Spalten in die SELECT-Liste.
const PROMOTION_CLICKS_COLUMNS_SQL = 'COALESCE(c.clicks7, 0) AS clicks7, COALESCE(c.clicksTotal, 0) AS clicksTotal'

function promotionClicksJoinSql(promotionAlias) {
  assertSqlAlias(promotionAlias)
  return `LEFT JOIN (
     SELECT target_id,
            SUM(CASE WHEN tag >= date('now', '-6 days') THEN anzahl ELSE 0 END) AS clicks7,
            SUM(anzahl) AS clicksTotal
     FROM link_clicks
     WHERE target_type = 'promotion'
     GROUP BY target_id
   ) c ON c.target_id = ${promotionAlias}.id`
}

// Bild einer Empfehlung - öffentlich über /partner-media wie Partner-Logos (lib/partners.js publicPartner).
function promotionImageUrl(bildFile) {
  return bildFile ? `/partner-media/${bildFile}` : null
}

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// Steuer-/Bidi-Zeichen raus (stripUnsafeChars aus lib/partners.js), dann trimmen - wie bei Partner-Texten.
function cleanTextInput(value) {
  return typeof value === 'string' ? stripUnsafeChars(value).trim() : ''
}

function cleanRequiredText(value, maxLength, label) {
  const trimmed = cleanTextInput(value)
  if (!trimmed) throw httpError(400, `${label} ist Pflicht`)
  if (trimmed.length > maxLength) throw httpError(400, `${label} darf höchstens ${maxLength} Zeichen haben`)
  return trimmed
}

// undefined/null/'' -> kein Wunsch (null), sonst geprüft und getrimmt.
function cleanOptionalText(value, maxLength, label) {
  if (value === undefined || value === null || value === '') return null
  const trimmed = cleanTextInput(value)
  if (!trimmed) return null
  if (trimmed.length > maxLength) throw httpError(400, `${label} darf höchstens ${maxLength} Zeichen haben`)
  return trimmed
}

function validateBereich(value) {
  if (!BEREICH_VALUES.includes(value)) throw httpError(400, `Bereich muss einer von ${BEREICH_VALUES.join(', ')} sein`)
  return value
}

function validateKennzeichnung(value) {
  if (!KENNZEICHNUNG_VALUES.includes(value)) {
    throw httpError(400, `Kennzeichnung muss einer von ${KENNZEICHNUNG_VALUES.join(', ')} sein`)
  }
  return value
}

function validateTierart(value) {
  if (value === undefined || value === null || value === '') return null
  if (!TIERART_VALUES.includes(value)) throw httpError(400, `Tierart muss einer von ${TIERART_VALUES.join(', ')} sein`)
  return value
}

// http(s), normalisiert (sanitizeExternalUrl aus lib/partners.js liefert new URL().href oder null) -
// anders als validateUrl in partners.js wirft diese Variante bei ungültigem Wert, statt ihn stillschweigend
// zu verwerfen (eine externe, unsichere Quelle gibt es hier nicht).
function validateUrl(value, label, maxLength = MAX_URL_LENGTH) {
  if (value === undefined || value === null || value === '') return null
  const trimmed = cleanTextInput(value)
  if (!trimmed) return null
  const href = sanitizeExternalUrl(trimmed, maxLength)
  if (!href) throw httpError(400, `${label}: ungültige Adresse`)
  return href
}

function validateDate(value, label) {
  if (value === undefined || value === null || value === '') return null
  if (!isIsoDate(value)) throw httpError(400, `${label}: ungültiges Datum (JJJJ-MM-TT)`)
  return value
}

// db optional (z. B. für isolierte Aufrufe ohne Datenbank) - ist es gesetzt, muss partner_id auf einen
// bestehenden Partner zeigen.
function validatePartnerId(value, db) {
  if (value === undefined || value === null || value === '') return null
  const id = cleanId(value)
  if (!id || Number.isNaN(id)) throw httpError(400, 'Diesen Partner gibt es nicht')
  if (db && !db.prepare('SELECT 1 FROM partners WHERE id = ?').get(id)) {
    throw httpError(400, 'Diesen Partner gibt es nicht')
  }
  return id
}

// Validiert und normalisiert die Eingabe für POST/PUT /api/admin/promotions - und (Phase P2 Task 8) für die
// Beiträge der Partner (lib/partnerPosts.js, dort mit fester Kennzeichnung "Anzeige"). is_demo/bild_file
// gehören bewusst nicht dazu: is_demo setzt (wie bei Partnern, siehe lib/demoPack.js) nur der
// Demo-Pack-Aufbau selbst bzw. der Partner-Beitrag vom Partner, bild_file nur der Bild-Upload
// (lib/promotionImage.js). freigabe/ablehnungsgrund setzen allein die Aufrufer.
function validatePromotion(input = {}, { db } = {}) {
  const bereich = validateBereich(input.bereich)
  const kennzeichnung = validateKennzeichnung(input.kennzeichnung)
  const titel = cleanRequiredText(input.titel, MAX_TITEL_LENGTH, 'Der Titel')
  const text = cleanOptionalText(input.text, MAX_TEXT_LENGTH, 'Der Text')
  const empfohlenVon = cleanOptionalText(input.empfohlenVon, MAX_EMPFOHLEN_VON_LENGTH, '„Empfehlung von“')

  if (kennzeichnung === 'Empfehlung' && !empfohlenVon) {
    throw httpError(400, 'Bei einer Empfehlung ist „Empfehlung von“ Pflicht')
  }

  const url = validateUrl(input.url, 'Der Link')
  const start = validateDate(input.start, 'Der Start')
  const ende = validateDate(input.ende, 'Das Ende')
  if (start && ende && ende < start) throw httpError(400, 'Das Ende darf nicht vor dem Start liegen')

  const tierart = validateTierart(input.tierart)
  const partnerId = validatePartnerId(input.partnerId, db)
  const aktiv = input.aktiv === undefined || input.aktiv === null ? true : Boolean(input.aktiv)
  const sort = Number.isInteger(input.sort) ? input.sort : 0

  // Rechtliches (Roadmap-Entscheidung 9): "Empfehlung von …" gilt nur ohne Gegenleistung - Züchter
  // rutschen hier nie durch, egal ob im Titel, im Text oder im "empfohlen von"-Feld.
  assertNoBreeder({ titel, text, empfohlen_von: empfohlenVon })

  return {
    partner_id: partnerId,
    bereich,
    kennzeichnung,
    empfohlen_von: empfohlenVon,
    titel,
    text,
    url,
    tierart,
    aktiv: aktiv ? 1 : 0,
    start,
    ende,
    sort
  }
}

// Grund einer Ablehnung (POST /api/admin/promotions/:id/ablehnen): Pflicht, ohne Steuer-/Bidi-Zeichen
// (auch ohne Zeilenumbruch), getrimmt, 3 bis 300 Zeichen. Der Partner sieht ihn in seiner Beitragsliste.
function validateAblehnungsgrund(value) {
  const grund = cleanTextInput(value)
  if (grund.length < MIN_ABLEHNUNGSGRUND_LENGTH || grund.length > MAX_ABLEHNUNGSGRUND_LENGTH) {
    throw httpError(400, `Bitte einen Grund mit ${MIN_ABLEHNUNGSGRUND_LENGTH} bis ${MAX_ABLEHNUNGSGRUND_LENGTH} Zeichen angeben`)
  }
  return grund
}

// Filter der Admin-Liste (?freigabe=): leer/fehlend = alle, sonst einer der FREIGABE_VALUES.
function validateFreigabeFilter(value) {
  if (value === undefined || value === '') return null
  if (!FREIGABE_VALUES.includes(value)) throw httpError(400, `Freigabe muss einer von ${FREIGABE_VALUES.join(', ')} sein`)
  return value
}

// --- Spendenberichte (donation_reports) -----------------------------------------------------------
// Gemeinsame Prüfung für POST/PUT /api/admin/donation-reports (routes/adminMarketing.js) und den
// Demo-Bericht (lib/demoPack.js) - eine ungültige Seed-Angabe scheitert so genauso laut wie eine
// ungültige Admin-Eingabe. Beträge in Cent (ganze Zahlen).

const MAX_ZEITRAUM_LENGTH = 40
const MAX_EMPFAENGER_LENGTH = 120
const MAX_CENTS = 1e9

function cleanCents(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > MAX_CENTS) {
    throw httpError(400, `${label} muss eine ganze Zahl zwischen 0 und ${MAX_CENTS} sein (Cent)`)
  }
  return value
}

function validateDonationReport(input = {}) {
  const zeitraum = cleanTextInput(input.zeitraum)
  if (!zeitraum) throw httpError(400, 'Der Zeitraum ist Pflicht')
  if (zeitraum.length > MAX_ZEITRAUM_LENGTH) throw httpError(400, `Der Zeitraum darf höchstens ${MAX_ZEITRAUM_LENGTH} Zeichen haben`)

  const eingangCents = cleanCents(input.eingangCents, 'Der Eingang')
  const kostenCents = cleanCents(input.kostenCents, 'Die Kosten')
  const weitergeleitetCents = cleanCents(input.weitergeleitetCents, 'Der weitergeleitete Betrag')
  const empfaenger = cleanOptionalText(input.empfaenger, MAX_EMPFAENGER_LENGTH, 'Der Empfänger')
  const nachweisUrl = validateUrl(input.nachweisUrl, 'Der Nachweis-Link')

  return {
    zeitraum,
    eingang_cents: eingangCents,
    kosten_cents: kostenCents,
    weitergeleitet_cents: weitergeleitetCents,
    empfaenger,
    nachweis_url: nachweisUrl
  }
}

module.exports = {
  validatePromotion,
  validateAblehnungsgrund,
  validateFreigabeFilter,
  promotionPartnerVisibleSql,
  promotionPublicSql,
  promotionActiveSql,
  promotionClicksJoinSql,
  promotionImageUrl,
  PROMOTION_CLICKS_COLUMNS_SQL,
  FREIGABE,
  FREIGABE_VALUES,
  validateDonationReport,
  cleanCents,
  cleanTextInput,
  cleanRequiredText,
  cleanOptionalText,
  validateUrl,
  validateDate,
  BEREICH_VALUES,
  KENNZEICHNUNG_VALUES,
  TIERART_VALUES,
  MAX_TITEL_LENGTH,
  MAX_TEXT_LENGTH,
  MAX_EMPFOHLEN_VON_LENGTH,
  MAX_URL_LENGTH,
  MAX_ZEITRAUM_LENGTH,
  MAX_EMPFAENGER_LENGTH,
  MAX_CENTS
}
