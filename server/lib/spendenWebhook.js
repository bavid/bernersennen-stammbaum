'use strict'

// Vorbereiteter Webhook für „Spenden live“ (POST /api/finanzierung/webhook/:quelle, routes/finanzierungWebhook.js). Heute
// ist kein Zahlungsanbieter angebunden - der Weg ist AUS (404), solange die Umgebungsvariable SPENDEN_WEBHOOK_SECRET fehlt
// oder kürzer als 16 Zeichen ist. Nur die Quellen 'gofundme' und 'paypal' (WEBHOOK_QUELLEN), andere 404. Ist das Secret
// gesetzt, muss jede Anfrage BEIDE Köpfe tragen (Pflicht - es ist noch kein Anbieter angebunden, der Adapter liefert sie):
//   X-Spenden-Zeit: <Unix-Sekunden>     (höchstens ±5 Minuten von der Serverzeit entfernt - gegen Wiederholung)
//   X-Spenden-Signatur: sha256=<hex>    (HMAC-SHA256 über "<Zeit>.<roher Body>" mit dem Secret)
// Der Vergleich ist zeitkonstant. Body (JSON):
//   { id: '<eindeutige Kennung beim Anbieter>', betragCents, datum?: 'JJJJ-MM-TT', anzeigename?, nachricht?, oeffentlich? }
// Öffentlich (Name und Nachricht auf /finanzierung) nur mit ausdrücklichem oeffentlich: true - fehlt es, bleibt sie privat.
// Dieselbe id derselben Quelle wird nur einmal erfasst (extern_ref UNIQUE) - ein wiederholter Aufruf antwortet 200.
// Ein Adapter je Anbieter (GoFundMe, PayPal) übersetzt später dessen Format in dieses.

const crypto = require('node:crypto')
const { createSpende, findSpendeByExternRef } = require('./spenden')
const { httpError } = require('./finanzierungFelder')

const MIN_SECRET_LENGTH = 16
const SIGNATUR_HEADER = 'x-spenden-signatur'
const SIGNATUR_PREFIX = 'sha256='
const ZEIT_HEADER = 'x-spenden-zeit'
const ZEIT_TOLERANZ_S = 5 * 60
const WEBHOOK_QUELLEN = Object.freeze(['gofundme', 'paypal'])
const MAX_EXTERN_ID = 100
const WEBHOOK_FIELDS = Object.freeze(['id', 'betragCents', 'datum', 'anzeigename', 'nachricht', 'oeffentlich'])

function webhookSecret(env = process.env) {
  const secret = (env.SPENDEN_WEBHOOK_SECRET || '').trim()
  return secret.length >= MIN_SECRET_LENGTH ? secret : null
}

function signatur(secret, zeit, rawBody) {
  return SIGNATUR_PREFIX + crypto.createHmac('sha256', secret).update(`${zeit}.`).update(rawBody).digest('hex')
}

// Zeitkopf: ganze Unix-Sekunden, höchstens ZEIT_TOLERANZ_S von nowMs entfernt.
function zeitGueltig(zeit, nowMs = Date.now()) {
  if (typeof zeit !== 'string' || !/^\d{1,12}$/.test(zeit.trim())) return false
  return Math.abs(Number(zeit.trim()) - Math.floor(nowMs / 1000)) <= ZEIT_TOLERANZ_S
}

function signaturGueltig(secret, rawBody, header, zeit, nowMs = Date.now()) {
  if (typeof header !== 'string' || !zeitGueltig(zeit, nowMs)) return false
  const expected = Buffer.from(signatur(secret, zeit.trim(), rawBody))
  const actual = Buffer.from(header.trim())
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

function parseBody(rawBody) {
  try {
    const body = JSON.parse(rawBody.toString('utf8'))
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('kein Objekt')
    return body
  } catch {
    throw httpError(400, 'Bitte gültiges JSON senden.')
  }
}

// { status, spende, doppelt } - wirft httpError (400) bei ungültigen Angaben.
function verarbeiteWebhook(quelle, rawBody) {
  const body = parseBody(rawBody)
  const unknown = Object.keys(body).find((key) => !WEBHOOK_FIELDS.includes(key))
  if (unknown !== undefined) throw httpError(400, `Unbekanntes Feld: ${unknown.slice(0, 40)}`)
  if (typeof body.id !== 'string' || !body.id.trim() || body.id.length > MAX_EXTERN_ID) throw httpError(400, 'Die Kennung (id) fehlt.', 'id')
  const externRef = `${quelle}:${body.id.trim()}`
  const vorhanden = findSpendeByExternRef(externRef)
  if (vorhanden) return { status: 200, spende: vorhanden, doppelt: true }
  const { id, ...felder } = body
  const spende = createSpende({ ...felder, quelle }, { externRef, oeffentlichVorgabe: 0 })
  return { status: 201, spende, doppelt: false }
}

module.exports = { WEBHOOK_QUELLEN, SIGNATUR_HEADER, ZEIT_HEADER, ZEIT_TOLERANZ_S, webhookSecret, signatur, zeitGueltig, signaturGueltig, verarbeiteWebhook }
