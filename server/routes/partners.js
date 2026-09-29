const fs = require('node:fs')
const express = require('express')
const db = require('../db')
const config = require('../config')
const { lookupPlz, distanceKm } = require('../lib/geo')
const { publicPartner, publicPartnerSql, isPubliclyVisible } = require('../lib/partners')
const { isAdmin } = require('../middleware/admin')
const { optionalSession } = require('../middleware/auth')
const { teaserFotoSql, teaserFoto } = require('../lib/einblicke')
const { buildPortal } = require('../lib/partnerPortal')
const { listPublicPosts } = require('../lib/partnerPosts')
const { promotionCard } = require('./discover')

const router = express.Router()

// Muss existieren, bevor app.js express.static() für /partner-media mountet (siehe dort).
fs.mkdirSync(config.partnerMediaDir, { recursive: true })

// Setzt req.isDemo, ohne anonyme Anfragen abzulehnen (siehe middleware/auth.js) - demoAllowed() unten
// braucht das, damit eine angemeldete Demo-Familie Demo-Partner auch in Produktion ohne ?demo=1 sieht.
router.use(optionalSession)

const RADIUS_VALUES = [5, 10, 25, 50, 100]

// Demo-Partner (is_demo=1) sind ausserhalb dev/staging nur mit ausdruecklichem ?demo=1 sichtbar, oder
// wenn die anfragende Sitzung selbst eine gültige Demo-Familie ist (Finding 2: "Zum Portal" aus
// /umgebung heraus soll für eine angemeldete Demo-Familie nicht 404en, auch nicht in Produktion) - in
// Produktion tauchen sie sonst in der echten Liste nicht auf.
function demoAllowed(req) {
  if (req.query.demo === '1') return true
  if (config.appEnv === 'dev' || config.appEnv === 'staging') return true
  return Boolean(req.isDemo)
}

function sortByName(rows) {
  return rows.slice().sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

// Öffentlich sichtbare Partner samt Teaser-Foto (neuester sichtbarer Einblick, lib/einblicke.js) - EINE
// Abfrage für die ganze Liste.
function visiblePartnerRows(req) {
  const demoClause = demoAllowed(req) ? '' : 'AND is_demo = 0'
  return db.prepare(`SELECT *, ${teaserFotoSql()} FROM partners WHERE ${publicPartnerSql()} ${demoClause}`).all()
}

// Partner-Karte in Liste/Umkreis: publicPartner plus teaserFoto (null ohne sichtbaren Einblick).
function partnerListCard(row) {
  return { ...publicPartner(row), teaserFoto: teaserFoto(row) }
}

// Aktive Partner im Umkreis von plz/radius, nach Entfernung sortiert - oder eine Fehlerantwort direkt
// über res. Gemeinsame Logik für GET ?plz= (Rückwärtskompatibilität) und POST /near (Finding 9: die PLZ
// soll nicht mehr zwingend in der URL landen, siehe Kommentar dort).
function nearbyPartners(req, res, { plz, radius }) {
  const radiusKm = Number(radius)
  if (!RADIUS_VALUES.includes(radiusKm)) {
    return res.status(400).json({ error: 'Der Umkreis muss 5, 10, 25, 50 oder 100 km sein' })
  }
  const center = lookupPlz(typeof plz === 'string' ? plz.trim() : '')
  if (!center) return res.status(400).json({ error: 'Diese Postleitzahl kennen wir nicht' })

  const rows = visiblePartnerRows(req)

  const results = rows
    .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lon))
    .map((row) => ({ row, distance: distanceKm(center, { lat: row.lat, lon: row.lon }) }))
    .filter(({ distance }) => distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance)
    .map(({ row, distance }) => ({ ...partnerListCard(row), distanceKm: Math.round(distance * 10) / 10 }))

  res.json(results)
}

// GET /api/public/partners?plz=&radius=&demo= - ohne plz: alle aktiven Partner nach Name; mit
// plz+radius: wie POST /near (Rückwärtskompatibilität, bis der Client umgestellt ist - siehe Finding 9).
router.get('/', (req, res) => {
  const { plz, radius } = req.query
  if (plz === undefined || plz === null || plz === '') {
    return res.json(sortByName(visiblePartnerRows(req)).map(partnerListCard))
  }
  nearbyPartners(req, res, { plz, radius })
})

// POST /api/public/partners/near { plz, radius } - dieselbe Antwort wie GET ?plz=&radius=, aber die PLZ
// steht im Body statt in der URL: eine URL landet leicht im Server-/Proxy-Zugriffslog, ein Body normal
// nicht (Finding 9). Rate-Limit wie gehabt über den globalen apiLimiter (app.js: app.use('/api', ...)).
router.post('/near', (req, res) => {
  const { plz, radius } = req.body || {}
  nearbyPartners(req, res, { plz, radius })
})

const PARTNER_NOT_FOUND = 'Diesen Partner gibt es nicht'

// Wer ein Portal sehen darf - EINE Regel für das Portal selbst und seine Beiträge: den Partner gibt es, ein
// Demo-Partner nur mit demoAllowed(), und er ist öffentlich sichtbar - oder die Anfrage kommt vom Admin
// (preview: true). Sonst null (-> 404).
function findPortalPartner(req) {
  const partner = db.prepare('SELECT * FROM partners WHERE slug = ?').get(req.params.slug)
  if (!partner) return null
  if (partner.is_demo && !demoAllowed(req)) return null
  const preview = !isPubliclyVisible(partner)
  if (preview && !isAdmin(req)) return null
  return { partner, preview }
}

// GET /api/public/partners/:slug - Portal-Daten. Nur aktiv und nicht gesperrt (lib/partners.js
// isPubliclyVisible), sonst 404 - ausser mit gültigem Admin-Cookie, dann als Vorschau (preview: true)
// auch für Entwürfe, pausierte und gesperrte Partner. Die Antwort selbst baut lib/partnerPortal.js
// buildPortal - dieselbe Form wie die Kundensicht des Partners (routes/partnerArea/preview.js).
router.get('/:slug', (req, res) => {
  const found = findPortalPartner(req)
  if (!found) return res.status(404).json({ error: PARTNER_NOT_FOUND })
  res.json({ ...buildPortal(found.partner), ...(found.preview ? { preview: true } : {}) })
})

// GET /api/public/partners/:slug/posts (Phase P2 Task 8) - die Beiträge (Empfehlungen/Anzeigen) des
// Partners fürs Portal: freigegeben, aktiv, im Zeitfenster, höchstens 10, nach sort und neueste zuerst
// (lib/partnerPosts.js listPublicPosts). Karten wie in "Entdecken", also mit kennzeichnung und clickUrl.
router.get('/:slug/posts', (req, res) => {
  const found = findPortalPartner(req)
  if (!found) return res.status(404).json({ error: PARTNER_NOT_FOUND })
  res.json(listPublicPosts(found.partner.id).map(promotionCard))
})

module.exports = router
