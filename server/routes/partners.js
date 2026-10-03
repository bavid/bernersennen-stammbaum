const fs = require('node:fs')
const express = require('express')
const rateLimit = require('express-rate-limit')
const db = require('../db')
const config = require('../config')
const { lookupPlz } = require('../lib/geo')
const { sortByName, radiusSection } = require('../lib/nearby')
const { publicPartner, publicPartnerSql, isPubliclyVisible } = require('../lib/partners')
const { isAdmin } = require('../middleware/admin')
const { optionalSession } = require('../middleware/auth')
const { teaserFotoSql, teaserFoto } = require('../lib/einblicke')
const { buildPortal } = require('../lib/partnerPortal')
const { listPublicPosts } = require('../lib/partnerPosts')
const { promotionCard } = require('./discover')
const { rejectHoneypot } = require('../middleware/abuse')
const { ipKeyGenerator } = require('../lib/rateLimitKey')
const { contactFormStatus, validateContactMessage, insertMessage } = require('../lib/partnerMessages')
const { notifyPartner, PARTNER_EREIGNIS } = require('../lib/partnerNotify')

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
// soll nicht mehr zwingend in der URL landen, siehe Kommentar dort). Phase P2 Task 9: dieselbe Auffüll-Regel
// wie "Entdecken" (lib/nearby.js radiusSection) - weniger als 5 im Radius -> die nächsten außerhalb dazu
// (höchstens 20, ausserhalb: true), im Radius ausserhalb: false. Die Antwort bleibt ein Array.
function nearbyPartners(req, res, { plz, radius }) {
  const radiusKm = Number(radius)
  if (!RADIUS_VALUES.includes(radiusKm)) {
    return res.status(400).json({ error: 'Der Umkreis muss 5, 10, 25, 50 oder 100 km sein' })
  }
  const center = lookupPlz(typeof plz === 'string' ? plz.trim() : '')
  if (!center) return res.status(400).json({ error: 'Diese Postleitzahl kennen wir nicht' })

  const { items } = radiusSection(visiblePartnerRows(req), center, radiusKm)
  res.json(items.map(({ row, distanceKm, ausserhalb }) => ({ ...partnerListCard(row), distanceKm, ausserhalb })))
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

// --- Kontaktformular (Phase P2 Task 9) ----------------------------------------------------------------

const ONE_HOUR = 60 * 60 * 1000
const DEMO_CONTACT_MESSAGE = 'In der Demo werden keine Nachrichten verschickt.'

// Eigenes, knappes Limit pro IP (Standard 5 je Stunde, config.contactRateLimit) zusätzlich zum globalen
// apiLimiter - mit demselben IPv6-maskierenden Schlüssel wie routes/discover.js discoverLimiter. Zählt jede
// Anfrage, auch abgelehnte: sonst ließe sich das Formular zum Ausprobieren von Adressen missbrauchen.
const contactLimiter = rateLimit({
  windowMs: ONE_HOUR,
  limit: config.contactRateLimit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  message: { error: 'Zu viele Nachrichten in kurzer Zeit – bitte später noch einmal versuchen.' }
})

// POST /api/public/partners/:slug/contact { name?, email?, telefon?, nachricht, bezugSlug?, website } - nur an
// einen öffentlich sichtbaren Partner (Portal-Regel, OHNE die Admin-Vorschau), dessen Kontaktformular aktiv
// ist und der einen Bereich hat (sonst gäbe es keinen Posteingang) - sonst 404. website ist der Honigtopf
// (middleware/abuse.js rejectHoneypot). Antwort ohne Echo der Nachricht; Inhalte und Kontaktdaten werden nie
// geloggt. Demo-Partner nehmen nichts an (403): ihr Posteingang ist für alle Demo-Besucher sichtbar.
router.post('/:slug/contact', contactLimiter, rejectHoneypot, (req, res, next) => {
  try {
    // Dieselbe Regel wie kontaktformular/kontaktformularDemo auf Portal und Steckbrief (lib/partnerMessages.js).
    const found = findPortalPartner(req)
    const status = found && !found.preview ? contactFormStatus(found.partner) : 'geschlossen'
    if (status === 'geschlossen') return res.status(404).json({ error: PARTNER_NOT_FOUND })
    if (status === 'demo') return res.status(403).json({ error: DEMO_CONTACT_MESSAGE })
    const partner = found.partner

    insertMessage(partner, validateContactMessage(req.body, partner))
    // Phase V4b: Telegram-Hinweis an den Partner - ohne Name, Kontaktdaten oder Text, asynchron (lib/partnerNotify.js).
    notifyPartner(partner.id, PARTNER_EREIGNIS.nachricht)
    res.status(201).json({ ok: true })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

module.exports = router
