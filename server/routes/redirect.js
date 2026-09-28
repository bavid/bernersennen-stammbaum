const express = require('express')
const db = require('../db')
const { isPubliclyVisible } = require('../lib/partners')

// Phase 3 Task 2: anonyme Klickzählung für externe Links im Reiter "Entdecken"
// (docs/superpowers/plans/2026-09-29-phase-3-entdecken.md). Die Ziel-URL kommt AUSSCHLIESSLICH aus der
// Datenbank, nie aus der Anfrage selbst - ein `?url=`-Parameter wird nirgends gelesen, es gibt also keine
// offene Weiterleitung. Kein Cookie, keine IP: link_clicks zählt nur (target_type, target_id, tag).

const router = express.Router()

const BOT_RE = /bot|crawl|spider|preview|slurp|facebookexternalhit/i
const GOFUNDME_SETTINGS_KEYS = { 0: 'gofundme_url', 1: 'demo_gofundme_url' }

const findPromotion = db.prepare('SELECT url, aktiv FROM promotions WHERE id = ?')
const findPartner = db.prepare('SELECT website, spenden_url, status, gesperrt FROM partners WHERE id = ?')
const findSetting = db.prepare('SELECT value FROM settings WHERE key = ?')

function promotionUrl(id) {
  const row = findPromotion.get(id)
  if (!row || !row.aktiv || !row.url) return null
  return row.url
}

// Nur aktive, nicht gesperrte Partner (Phase P Task 1) - wie jede andere öffentliche Partner-Abfrage.
function partnerWebsiteUrl(id) {
  const row = findPartner.get(id)
  if (!isPubliclyVisible(row) || !row.website) return null
  return row.website
}

function partnerSpendeUrl(id) {
  const row = findPartner.get(id)
  if (!isPubliclyVisible(row) || !row.spenden_url) return null
  return row.spenden_url
}

function gofundmeUrl(id) {
  const key = GOFUNDME_SETTINGS_KEYS[id]
  if (!key) return null
  const row = findSetting.get(key)
  return row?.value || null
}

// type -> Auflöse-Funktion(id) -> Ziel-URL oder null (unbekannt/inaktiv)
const TARGET_RESOLVERS = {
  promotion: promotionUrl,
  'partner-website': partnerWebsiteUrl,
  'partner-spende': partnerSpendeUrl,
  gofundme: gofundmeUrl
}

// UPSERT statt SELECT+INSERT/UPDATE: gleichzeitige Klicks auf denselben Link am selben Tag zählen sicher
// hoch, ohne eine Race zwischen Lesen und Schreiben zu riskieren.
const countClick = db.prepare(
  `INSERT INTO link_clicks (target_type, target_id, tag, anzahl) VALUES (?, ?, date('now'), 1)
   ON CONFLICT(target_type, target_id, tag) DO UPDATE SET anzahl = anzahl + 1`
)

// GET /r/:type/:id - type einer von promotion/partner-website/partner-spende/gofundme (siehe
// TARGET_RESOLVERS). Absichtlich ohne Login/Session: der Link kann außerhalb der App geöffnet werden
// (z. B. ein neuer Tab), und die Sichtbarkeitsprüfung ist längst in POST /api/discover passiert, das die
// clickUrl überhaupt erst ausliefert.
router.get('/:type/:id', (req, res) => {
  // Keine geteilten Caches, kein Referrer an das Ziel - vor jeder möglichen Rückgabe gesetzt (auch 404).
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Cache-Control', 'no-store')

  const notFound = () => res.status(404).json({ error: 'Nicht gefunden' })

  const resolve = TARGET_RESOLVERS[req.params.type]
  if (!resolve) return notFound()

  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 0) return notFound()

  const target = resolve(id)
  if (!target) return notFound()

  const userAgent = req.get('User-Agent') || ''
  if (!BOT_RE.test(userAgent)) {
    countClick.run(req.params.type, id)
  }

  res.redirect(302, target)
})

module.exports = router
