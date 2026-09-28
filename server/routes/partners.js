const fs = require('node:fs')
const express = require('express')
const db = require('../db')
const config = require('../config')
const { lookupPlz, distanceKm } = require('../lib/geo')
const { publicPartner } = require('../lib/partners')
const { isAdmin } = require('../middleware/admin')

const router = express.Router()

// Muss existieren, bevor app.js express.static() für /partner-media mountet (siehe dort).
fs.mkdirSync(config.partnerMediaDir, { recursive: true })

const RADIUS_VALUES = [5, 10, 25, 50, 100]

// Demo-Partner (is_demo=1) sind ausserhalb dev/staging nur mit ausdruecklichem ?demo=1 sichtbar - in
// Produktion tauchen sie in der echten Liste nicht auf.
function demoAllowed(req) {
  if (req.query.demo === '1') return true
  return config.appEnv === 'dev' || config.appEnv === 'staging'
}

function sortByName(rows) {
  return rows.slice().sort((a, b) => a.name.localeCompare(b.name, 'de'))
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

  const demoClause = demoAllowed(req) ? '' : 'AND is_demo = 0'
  const rows = db.prepare(`SELECT * FROM partners WHERE status = 'aktiv' ${demoClause}`).all()

  const results = rows
    .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lon))
    .map((row) => ({ row, distance: distanceKm(center, { lat: row.lat, lon: row.lon }) }))
    .filter(({ distance }) => distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance)
    .map(({ row, distance }) => ({ ...publicPartner(row), distanceKm: Math.round(distance * 10) / 10 }))

  res.json(results)
}

// GET /api/public/partners?plz=&radius=&demo= - ohne plz: alle aktiven Partner nach Name; mit
// plz+radius: wie POST /near (Rückwärtskompatibilität, bis der Client umgestellt ist - siehe Finding 9).
router.get('/', (req, res) => {
  const { plz, radius } = req.query
  if (plz === undefined || plz === null || plz === '') {
    const demoClause = demoAllowed(req) ? '' : 'AND is_demo = 0'
    const rows = db.prepare(`SELECT * FROM partners WHERE status = 'aktiv' ${demoClause}`).all()
    return res.json(sortByName(rows).map((row) => publicPartner(row)))
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

// GET /api/public/partners/:slug - Portal-Daten. Nur status='aktiv', sonst 404 - ausser mit gültigem
// Admin-Cookie, dann als Vorschau (preview: true) auch für Entwürfe/pausierte Partner.
router.get('/:slug', (req, res) => {
  const partner = db.prepare('SELECT * FROM partners WHERE slug = ?').get(req.params.slug)
  const notFound = () => res.status(404).json({ error: 'Diesen Partner gibt es nicht' })
  if (!partner) return notFound()
  if (partner.is_demo && !demoAllowed(req)) return notFound()

  const preview = partner.status !== 'aktiv'
  if (preview && !isAdmin(req)) return notFound()

  res.json({
    ...publicPartner(partner),
    portal_titel: partner.portal_titel,
    portal_text: partner.portal_text,
    spenden_url: partner.spenden_url,
    vermittlung_url: partner.vermittlung_url,
    farbe: partner.farbe,
    ...(preview ? { preview: true } : {})
  })
})

module.exports = router
