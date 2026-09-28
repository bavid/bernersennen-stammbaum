const express = require('express')
const rateLimit = require('express-rate-limit')
const db = require('../db')
const config = require('../config')
const { requireSession } = require('../middleware/auth')
const { ipKeyGenerator } = require('../lib/rateLimitKey')
const { lookupPlz, distanceKm } = require('../lib/geo')
const { publicPartner } = require('../lib/partners')
const { getShelterAnimalCards } = require('./publicAnimals')

// Phase 3 Task 2: Reiter "Entdecken" - eine Antwort bündelt alle vier Abschnitte
// (docs/superpowers/plans/2026-09-29-phase-3-entdecken.md). requireSession statt requireAuth: die Demo
// darf mitlesen (wie bei places.js), Schreibzugriffe gibt es hier ohnehin nicht.

const router = express.Router()

const TEN_MINUTES = 10 * 60 * 1000
const RADIUS_VALUES = [5, 10, 25, 50, 100]
const MAX_BEGLEITER_TIERE = 12

// Eigenes, knappes Limit pro IP zusätzlich zum globalen apiLimiter (app.js: app.use('/api', apiLimiter))
// - wie places.js placesLimiter, gleiche Werte und derselbe IPv6-maskierende Schlüssel.
const discoverLimiter = rateLimit({
  windowMs: TEN_MINUTES,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  message: { error: 'Zu viele Anfragen in kurzer Zeit – bitte einen Moment warten.' }
})

function sortByName(rows) {
  return rows.slice().sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

// Partner (Tierheime, Vermittlungsstellen, Hundeschulen): eine Demo-Sitzung sieht NUR Demo-Partner, eine
// echte NUR echte - außer in appEnv dev/staging, wo eine echte Test-Sitzung zusätzlich die Demo-Partner
// sieht (wie partners.js demoAllowed). Anders als bei Empfehlungen/Spendenberichten/Einstellungen gibt es
// hier also einen dev/staging-Bonus (siehe Aufgabenstellung Task 2).
function partnerDemoValues(req) {
  if (req.isDemo) return [1]
  if (config.appEnv === 'dev' || config.appEnv === 'staging') return [0, 1]
  return [0]
}

// Empfehlungen/Anzeigen und Spendenberichte bleiben STRIKT nach is_demo getrennt, ohne dev/staging-Bonus
// (Aufgabenstellung: "promotions/reports/settings stay separated by is_demo").
function contentDemoValue(req) {
  return req.isDemo ? 1 : 0
}

// settings-Schlüssel: Demo-Sitzungen lesen die demo_*-Schlüssel, echte die echten (siehe
// routes/adminMarketing.js SETTINGS_KEYS, das genau diese Paare pflegt).
function settingsKey(req, base) {
  return req.isDemo ? `demo_${base}` : base
}

function activePartnerRows(typs, req) {
  const demoValues = partnerDemoValues(req)
  const typPlaceholders = typs.map(() => '?').join(', ')
  const demoPlaceholders = demoValues.map(() => '?').join(', ')
  return db
    .prepare(`SELECT * FROM partners WHERE status = 'aktiv' AND typ IN (${typPlaceholders}) AND is_demo IN (${demoPlaceholders})`)
    .all(...typs, ...demoValues)
}

// Aktive Empfehlungen/Anzeigen eines Bereichs im Zeitfenster (NULL = offen), nach sort/Titel sortiert.
function activePromotionRows(bereich, req) {
  return db
    .prepare(
      `SELECT * FROM promotions
       WHERE bereich = ? AND aktiv = 1 AND is_demo = ?
         AND (start IS NULL OR start <= date('now'))
         AND (ende IS NULL OR ende >= date('now'))
       ORDER BY sort, titel`
    )
    .all(bereich, contentDemoValue(req))
}

// Ordnet Partner-Zeilen nach Entfernung (mit center) oder nach Name (ohne) und liefert { row,
// distanceKm? } - distanceKm fehlt ganz ohne PLZ, statt undefined mitzuschleppen (siehe partnerCard unten).
function orderPartners(rows, center, radiusKm) {
  if (!center) return sortByName(rows).map((row) => ({ row }))
  return rows
    .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lon))
    .map((row) => ({ row, dist: distanceKm(center, { lat: row.lat, lon: row.lon }) }))
    .filter(({ dist }) => dist <= radiusKm)
    .sort((a, b) => a.dist - b.dist)
    .map(({ row, dist }) => ({ row, distanceKm: Math.round(dist * 10) / 10 }))
}

// Partner-Karte: wie lib/partners.js publicPartner, aber die Website läuft über die Klickzählung
// (clickUrl + rohe url zur Anzeige) statt roh im Feld "website" zu stehen (Aufgabenstellung: "Every
// external link is delivered as clickUrl ... plus the raw url for display").
function partnerCard(row, distanceKmValue) {
  const { website, ...pub } = publicPartner(row)
  return {
    ...pub,
    kind: 'partner',
    url: website || null,
    clickUrl: website ? `/r/partner-website/${row.id}` : null,
    ...(distanceKmValue !== undefined ? { distanceKm: distanceKmValue } : {})
  }
}

function promotionCard(row) {
  return {
    id: row.id,
    kind: 'promotion',
    bereich: row.bereich,
    kennzeichnung: row.kennzeichnung,
    empfohlenVon: row.empfohlen_von,
    titel: row.titel,
    text: row.text,
    bildUrl: row.bild_file ? `/partner-media/${row.bild_file}` : null,
    tierart: row.tierart,
    url: row.url,
    clickUrl: row.url ? `/r/promotion/${row.id}` : null
  }
}

function spendenCard(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    logoUrl: row.logo_file ? `/partner-media/${row.logo_file}` : null,
    url: row.spenden_url,
    clickUrl: `/r/partner-spende/${row.id}`
  }
}

function newestDonationReport(req) {
  const row = db
    .prepare('SELECT * FROM donation_reports WHERE is_demo = ? ORDER BY created_at DESC, id DESC LIMIT 1')
    .get(contentDemoValue(req))
  if (!row) return null
  return {
    zeitraum: row.zeitraum,
    eingangCents: row.eingang_cents,
    kostenCents: row.kosten_cents,
    weitergeleitetCents: row.weitergeleitet_cents,
    empfaenger: row.empfaenger,
    nachweisUrl: row.nachweis_url
  }
}

function readSettingValue(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  return row?.value ? row.value : null
}

// POST /api/discover { plz?, radius? } - die PLZ steht bewusst im Body statt in der URL (wie POST
// /api/public/partners/near, siehe dort für die Begründung: Server-/Proxy-Zugriffslogs).
router.post('/', discoverLimiter, requireSession, (req, res) => {
  const { plz, radius } = req.body || {}

  let center = null
  let radiusKm = null
  if (plz !== undefined && plz !== null && plz !== '') {
    radiusKm = Number(radius)
    if (!RADIUS_VALUES.includes(radiusKm)) {
      return res.status(400).json({ error: 'Der Umkreis muss 5, 10, 25, 50 oder 100 km sein' })
    }
    const hit = lookupPlz(typeof plz === 'string' ? plz.trim() : '')
    if (!hit) return res.status(400).json({ error: 'Diese Postleitzahl kennen wir nicht' })
    center = { lat: hit.lat, lon: hit.lon, ort: hit.ort }
  }

  // --- Hundeschule gesucht? ------------------------------------------------------------------------
  const hundeschulPartner = orderPartners(activePartnerRows(['hundeschule'], req), center, radiusKm)
    .map(({ row, distanceKm: d }) => partnerCard(row, d))
  const hundeschulPromotions = activePromotionRows('hundeschule', req).map(promotionCard)
  const hundeschulen = [...hundeschulPartner, ...hundeschulPromotions]

  // --- Neuer Begleiter gesucht? --------------------------------------------------------------------
  const begleiterOrdered = orderPartners(activePartnerRows(['tierheim', 'vermittlung'], req), center, radiusKm)
  const begleiterPartner = begleiterOrdered.map(({ row, distanceKm: d }) => partnerCard(row, d))
  const begleiterTiere = begleiterOrdered
    .flatMap(({ row, distanceKm: d }) =>
      getShelterAnimalCards(row.id).map((animal) => (d !== undefined ? { ...animal, distanceKm: d } : animal))
    )
    .slice(0, MAX_BEGLEITER_TIERE)

  // --- Futter-Empfehlungen --------------------------------------------------------------------------
  const futter = activePromotionRows('futter', req).map(promotionCard)

  // --- Unterstützen -----------------------------------------------------------------------------------
  const gofundmeUrl = readSettingValue(settingsKey(req, 'gofundme_url'))
  const partnerSpenden = begleiterOrdered
    .map(({ row }) => row)
    .filter((row) => row.spenden_url)
    .map(spendenCard)

  res.json({
    ...(center ? { center } : {}),
    hundeschulen,
    begleiter: { partner: begleiterPartner, tiere: begleiterTiere },
    futter,
    unterstuetzen: {
      gofundmeUrl,
      gofundmeClickUrl: gofundmeUrl ? `/r/gofundme/${req.isDemo ? 1 : 0}` : null,
      text: readSettingValue(settingsKey(req, 'unterstuetzen_text')),
      bericht: newestDonationReport(req),
      partnerSpenden
    }
  })
})

module.exports = router
