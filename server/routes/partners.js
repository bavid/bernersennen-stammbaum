const fs = require('node:fs')
const express = require('express')
const db = require('../db')
const config = require('../config')
const { lookupPlz, distanceKm } = require('../lib/geo')
const { publicPartner, publicPartnerSql, isPubliclyVisible } = require('../lib/partners')
const { isAdmin } = require('../middleware/admin')
const { optionalSession } = require('../middleware/auth')
const { teaserFotoSql, teaserFoto, listVisibleEinblicke, publicEinblick } = require('../lib/einblicke')

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

// findShelterFamily: wie server/routes/publicAnimals.js - existiert für diesen Partner überhaupt ein
// Tierheim-Bereich? Ohne ihn wäre "Demo als Tierheim ansehen" (Task 6) ein toter Knopf: api.demo({as:
// 'tierheim'}) schlägt fehl, wenn der Demo-Partner (noch) keinen eigenen Tierheim-Bereich hat (final-
// review: der Knopf hing bisher allein an partner.is_demo, nicht an dessen tatsächlicher Existenz).
const findShelterFamily = db.prepare("SELECT id FROM families WHERE partner_id = ? AND art = 'tierheim'")

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

// GET /api/public/partners/:slug - Portal-Daten. Nur aktiv und nicht gesperrt (lib/partners.js
// isPubliclyVisible), sonst 404 - ausser mit gültigem Admin-Cookie, dann als Vorschau (preview: true)
// auch für Entwürfe, pausierte und gesperrte Partner.
router.get('/:slug', (req, res) => {
  const partner = db.prepare('SELECT * FROM partners WHERE slug = ?').get(req.params.slug)
  const notFound = () => res.status(404).json({ error: 'Diesen Partner gibt es nicht' })
  if (!partner) return notFound()
  if (partner.is_demo && !demoAllowed(req)) return notFound()

  const preview = !isPubliclyVisible(partner)
  if (preview && !isAdmin(req)) return notFound()

  res.json({
    ...publicPartner(partner),
    portal_titel: partner.portal_titel,
    portal_text: partner.portal_text,
    spenden_url: partner.spenden_url,
    vermittlung_url: partner.vermittlung_url,
    // Phase P Task 1: Link zum eigenen Kontaktformular des Partners (nur http(s), siehe validatePartner).
    kontakt_formular_url: partner.kontakt_formular_url,
    farbe: partner.farbe,
    ...(preview ? { preview: true } : {}),
    // Phase T Task 6: der Client zeigt für Demo-Partner mit einem tatsächlich bestehenden Demo-Tierheim
    // zusätzlich "Demo als Tierheim ansehen" (PartnerPortalPage.jsx) - ohne extra Anfrage.
    ...(partner.is_demo && findShelterFamily.get(partner.id) ? { shelterDemo: true } : {}),
    // Phase P Task 3b: höchstens 60 nicht ausgeblendete Einblicke, neueste zuerst.
    einblicke: listVisibleEinblicke(partner.id).map((row) => publicEinblick(row))
  })
})

module.exports = router
