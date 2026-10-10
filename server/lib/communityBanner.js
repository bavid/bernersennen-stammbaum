'use strict'

// Band „Mit dabei“ (Startseite, lib/community.js): was der Admin daran einstellt - ein Eintrag 'community_banner' (JSON)
// in der Tabelle settings, gepflegt über routes/adminCommunity.js (GET/PUT /api/admin/community/banner).
// - partnerId + bis: der „Partner des Monats“ (ausdrückliche Wahl; ohne Wahl oder nach „bis“ gelten wie bisher die
//   vorgestellten Partner aus lib/partnerVorgestellt.js). Erscheint nur, solange der Partner öffentlich sichtbar ist.
// - chips: welche Zahlen das Band zeigt; die Reihenfolge ist fest (CHIP_KEYS).
// - text + link: ein eigener kurzer Eintrag („Neu: Wir waren hier“), Link nur als interner Pfad („/…“, nie „//…“).
// Dazu partnerFotos: bis zu fünf bereits öffentliche Fotos eines öffentlichen Partners (Bannerfotos, Einblicke, Logo).

const db = require('../db')
const { publicPartnerSql, stripUnsafeChars } = require('./partners')
const { listBanner, publicBanner } = require('./partnerBanner')
const { listVisibleEinblicke, publicEinblick } = require('./einblicke')
const { cleanId, isIsoDate } = require('./validate')

const KEY = 'community_banner'
const CHIP_KEYS = Object.freeze(['familien', 'zuhause', 'erinnerungen', 'fotos', 'spenden', 'partner'])
const MAX_TEXT = 80
const MAX_LINK = 200
const MAX_FOTOS = 5
// Interner Pfad: beginnt mit genau einem „/“, danach nur URL-sichere Zeichen - kein „//host“, kein „\“, kein Schema.
const LINK_RE = /^\/(?![/\\])[A-Za-z0-9\-._~/?=&#%+]*$/
const DEFAULTS = Object.freeze({ partnerId: null, bis: null, chips: CHIP_KEYS, text: null, link: null })

const readStmt = db.prepare('SELECT value FROM settings WHERE key = ?')
const upsertStmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
const publicPartnerStmt = db.prepare(`SELECT id, slug, name, typ, is_demo, logo_file FROM partners WHERE id = ? AND ${publicPartnerSql()}`)
const publicListStmt = db.prepare(`SELECT id, slug, name, typ, is_demo FROM partners WHERE ${publicPartnerSql()} ORDER BY name COLLATE NOCASE`)
const logoStmt = db.prepare('SELECT logo_file FROM partners WHERE id = ?')

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// Gespeicherten Stand lesen - kaputtes JSON oder fremde Werte fallen still auf die Vorgabe zurück.
function normalize(raw) {
  const value = raw && typeof raw === 'object' ? raw : {}
  const chips = Array.isArray(value.chips) ? CHIP_KEYS.filter((key) => value.chips.includes(key)) : CHIP_KEYS
  return {
    partnerId: cleanId(value.partnerId) || null,
    bis: isIsoDate(value.bis) ? value.bis : null,
    chips: [...chips],
    text: typeof value.text === 'string' && value.text ? value.text : null,
    link: typeof value.link === 'string' && LINK_RE.test(value.link) ? value.link : null
  }
}

function readBannerConfig() {
  const row = readStmt.get(KEY)
  if (!row) return { ...DEFAULTS, chips: [...CHIP_KEYS] }
  try {
    return normalize(JSON.parse(row.value))
  } catch {
    return { ...DEFAULTS, chips: [...CHIP_KEYS] }
  }
}

function validatePartnerId(value) {
  if (value === null || value === undefined || value === '') return null
  const id = cleanId(value)
  if (!id) throw httpError(400, 'Bitte einen Partner aus der Liste wählen.')
  if (!publicPartnerStmt.get(id)) throw httpError(400, 'Dieser Partner ist nicht öffentlich sichtbar.')
  return id
}

function validateBis(value) {
  if (value === null || value === undefined || value === '') return null
  if (!isIsoDate(value)) throw httpError(400, '„bis“ muss ein Datum sein (JJJJ-MM-TT).')
  return value
}

function validateChips(value) {
  if (!Array.isArray(value) || value.some((key) => !CHIP_KEYS.includes(key))) {
    throw httpError(400, `„chips“ darf nur ${CHIP_KEYS.join(', ')} enthalten.`)
  }
  return CHIP_KEYS.filter((key) => value.includes(key))
}

function validateText(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') throw httpError(400, 'Der Text muss reiner Text sein.')
  const text = stripUnsafeChars(value).trim()
  if (!text) return null
  if (text.length > MAX_TEXT) throw httpError(400, `Der Text darf höchstens ${MAX_TEXT} Zeichen haben.`)
  if (/[<>]/.test(text)) throw httpError(400, 'Der Text darf nur reinen Text enthalten (kein HTML).')
  return text
}

function validateLink(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string' || value.length > MAX_LINK || !LINK_RE.test(value.trim())) {
    throw httpError(400, 'Der Link muss ein Pfad in der App sein und mit „/“ beginnen (z. B. /partner-werden).')
  }
  return value.trim()
}

// Ganzer Stand aus dem Admin-Formular; jede ungültige Angabe -> 400.
function validateBannerConfig(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw httpError(400, 'Ungültige Angaben.')
  const text = validateText(body.text)
  const link = validateLink(body.link)
  if (link && !text) throw httpError(400, 'Ein Link braucht einen Text.')
  return { partnerId: validatePartnerId(body.partnerId), bis: validateBis(body.bis), chips: validateChips(body.chips), text, link }
}

// { config, changed }
function saveBannerConfig(config) {
  const before = JSON.stringify(readBannerConfig())
  const value = JSON.stringify(config)
  upsertStmt.run(KEY, value)
  return { config: readBannerConfig(), changed: before !== value }
}

function today(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// Der gewählte Partner des Monats ({ id, slug, name, typ, is_demo }) - oder null (keine Wahl, abgelaufen, nicht öffentlich).
function chosenPartner(config = readBannerConfig(), now = new Date()) {
  if (!config.partnerId) return null
  if (config.bis && config.bis < today(now)) return null
  return publicPartnerStmt.get(config.partnerId) || null
}

// Bis zu MAX_FOTOS öffentliche Foto-Adressen: Bannerfotos, dann die neuesten Einblicke, zuletzt das Logo. Nur für
// Partner, die der Aufrufer schon als öffentlich geprüft hat (/public-media liefert sonst ohnehin 404).
function partnerFotos(partnerId) {
  const urls = [
    ...listBanner(partnerId).map((row) => publicBanner(row).fotoUrl),
    ...listVisibleEinblicke(partnerId).map((row) => publicEinblick(row).fotoUrl)
  ]
  const logo = logoStmt.get(partnerId)?.logo_file
  if (logo) urls.push(`/partner-media/${logo}`)
  return [...new Set(urls.filter(Boolean))].slice(0, MAX_FOTOS)
}

// Auswahl im Admin: alle öffentlich sichtbaren Partner.
function listPublicPartners() {
  return publicListStmt.all().map(({ id, slug, name, typ, is_demo: isDemo }) => ({ id, slug, name, typ, isDemo: Boolean(isDemo) }))
}

module.exports = {
  KEY,
  CHIP_KEYS,
  MAX_TEXT,
  MAX_FOTOS,
  readBannerConfig,
  validateBannerConfig,
  saveBannerConfig,
  chosenPartner,
  partnerFotos,
  listPublicPartners
}
