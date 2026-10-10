'use strict'

// Plan 2027 Kap. 6: GET /<kurzname> einer aktiven Landeadresse (lib/landeadressen.js) zählt anonym und leitet per 302 in
// die App weiter. Alles andere - unbekannte oder ausgeschaltete Kurznamen, andere Pfade - fällt durch zur
// Client-Auslieferung (app.js serveClient). Gegen Aufblähen zählt dieselbe IP dieselbe Adresse höchstens einmal je
// Stunde; die IP liegt dafür nur im Arbeitsspeicher (nie in der Datenbank) und fällt nach der Stunde wieder heraus.

const fs = require('node:fs')
const config = require('../config')
const { findAktiv, zaehleBesuch } = require('./landeadressen')
const { ipKeyGenerator } = require('./rateLimitKey')
const { isReserviert } = require('./landeadressenRegeln')

const PFAD_RE = /^\/([A-Za-z0-9-]{2,30})\/?$/
// Wie routes/redirect.js: Vorschau-Abrufe von Messengern und Suchmaschinen zählen nicht.
const BOT_RE = /bot|crawl|spider|preview|slurp|facebookexternalhit|whatsapp|telegram/i
const ZAEHL_FENSTER_MS = 60 * 60 * 1000
const MAX_EINTRAEGE = 20000

const zuletztGezaehlt = new Map()

// Namen der Dateien und Ordner im Wurzelverzeichnis von client/dist (je mit und ohne Endung, klein geschrieben): ein
// Kurzname verdeckt nie eine ausgelieferte Datei, auch wenn sie in RESERVIERT fehlt. Kurz zwischengespeichert, damit
// nicht jeder Seitenaufruf das Verzeichnis liest; ohne gebauten Client leer.
const DIST_CACHE_MS = 60 * 1000
let distCache = { namen: new Set(), bis: 0 }

function distWurzelNamen(now = Date.now()) {
  if (now < distCache.bis) return distCache.namen
  let eintraege = []
  try {
    eintraege = fs.readdirSync(config.clientDist)
  } catch {
    eintraege = []
  }
  const namen = new Set(eintraege.flatMap((name) => [name.toLowerCase(), name.toLowerCase().replace(/\.[^.]*$/, '')]))
  distCache = { namen, bis: now + DIST_CACHE_MS }
  return namen
}

function aufraeumen(now) {
  for (const [key, zeit] of zuletztGezaehlt) {
    if (now - zeit >= ZAEHL_FENSTER_MS) zuletztGezaehlt.delete(key)
  }
  if (zuletztGezaehlt.size >= MAX_EINTRAEGE) zuletztGezaehlt.clear()
}

// true, wenn dieser Aufruf zählen darf (und merkt ihn sich für das Fenster).
function darfZaehlen(req, id, now = Date.now()) {
  const key = `${ipKeyGenerator(req)}|${id}`
  const zuletzt = zuletztGezaehlt.get(key)
  if (zuletzt !== undefined && now - zuletzt < ZAEHL_FENSTER_MS) return false
  if (zuletztGezaehlt.size >= MAX_EINTRAEGE / 2) aufraeumen(now)
  zuletztGezaehlt.set(key, now)
  return true
}

function landeadresseWeiterleitung(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next()
  const match = PFAD_RE.exec(req.path)
  const slug = match?.[1].toLowerCase()
  if (!slug || isReserviert(slug) || distWurzelNamen().has(slug)) return next()
  const row = findAktiv(slug)
  if (!row) return next()

  res.setHeader('Cache-Control', 'no-store')
  const isBot = BOT_RE.test(req.get('User-Agent') || '')
  if (req.method === 'GET' && !isBot && darfZaehlen(req, row.id)) zaehleBesuch(row.id)
  res.redirect(302, row.ziel)
}

function resetZaehlSperre() {
  zuletztGezaehlt.clear()
  distCache = { namen: new Set(), bis: 0 }
}

module.exports = { landeadresseWeiterleitung, resetZaehlSperre }
