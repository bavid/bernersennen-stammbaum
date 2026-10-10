'use strict'

// Vorbereiteter Webhook für „Spenden live“ (POST /api/finanzierung/webhook/:quelle, routes/finanzierungWebhook.js). Heute
// ist kein Zahlungsanbieter angebunden - der Weg ist AUS (404), solange die Umgebungsvariable SPENDEN_WEBHOOK_SECRET fehlt
// oder kürzer als 16 Zeichen ist. Ist sie gesetzt, muss jede Anfrage den Kopf
//   X-Spenden-Signatur: sha256=<hex>   (HMAC-SHA256 des rohen Bodys mit dem Secret)
// tragen; der Vergleich ist zeitkonstant. Body (JSON):
//   { id: '<eindeutige Kennung beim Anbieter>', betragCents, datum?: 'JJJJ-MM-TT', anzeigename?, nachricht?, oeffentlich? }
// Dieselbe id derselben Quelle wird nur einmal erfasst (extern_ref UNIQUE) - ein wiederholter Aufruf antwortet 200.
// Ein Adapter je Anbieter (GoFundMe, PayPal) übersetzt später dessen Format in dieses.

const crypto = require('node:crypto')
const { QUELLEN, createSpende, findSpendeByExternRef } = require('./spenden')
const { httpError } = require('./finanzierungFelder')

const MIN_SECRET_LENGTH = 16
const SIGNATUR_HEADER = 'x-spenden-signatur'
const SIGNATUR_PREFIX = 'sha256='
const MAX_EXTERN_ID = 100
const WEBHOOK_FIELDS = Object.freeze(['id', 'betragCents', 'datum', 'anzeigename', 'nachricht', 'oeffentlich'])

function webhookSecret(env = process.env) {
  const secret = (env.SPENDEN_WEBHOOK_SECRET || '').trim()
  return secret.length >= MIN_SECRET_LENGTH ? secret : null
}

function signatur(secret, rawBody) {
  return SIGNATUR_PREFIX + crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
}

function signaturGueltig(secret, rawBody, header) {
  if (typeof header !== 'string') return false
  const expected = Buffer.from(signatur(secret, rawBody))
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
  const spende = createSpende({ ...felder, quelle }, { externRef })
  return { status: 201, spende, doppelt: false }
}

module.exports = { QUELLEN, SIGNATUR_HEADER, webhookSecret, signatur, signaturGueltig, verarbeiteWebhook }
