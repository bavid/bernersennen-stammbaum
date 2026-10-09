const fs = require('node:fs')
const path = require('node:path')
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const multer = require('multer')
const cookieParser = require('cookie-parser')

const config = require('./config')
const db = require('./db')
const authRoutes = require('./routes/auth')
const dogsRoutes = require('./routes/dogs')
const timelineRoutes = require('./routes/timeline')
const breedingRoutes = require('./routes/breeding')
const notesRoutes = require('./routes/notes')
const adminRoutes = require('./routes/admin')
const adminMarketingRoutes = require('./routes/adminMarketing')
const adminStatsRoutes = require('./routes/adminStats')
const adminAnfragenRoutes = require('./routes/adminAnfragen')
const adminNotifyRoutes = require('./routes/adminNotify')
const adminTermineRoutes = require('./routes/adminTermine')
const adminBannerRoutes = require('./routes/adminBanner')
const adminHinweiseRoutes = require('./routes/adminHinweise')
const adminServerRoutes = require('./routes/adminServer')
const adminEinladungskarteRoutes = require('./routes/adminEinladungskarte')
const adminFinanzierungRoutes = require('./routes/adminFinanzierung')
const adminPartnerSichtbarRoutes = require('./routes/adminPartnerSichtbar')
const finanzierungRoutes = require('./routes/finanzierung')
const communityRoutes = require('./routes/community')
const adminCommunityRoutes = require('./routes/adminCommunity')
const hinweiseRoutes = require('./routes/hinweise')
const meineHinweiseRoutes = require('./routes/meineHinweise')
const vouchersRoutes = require('./routes/vouchers')
const besucheRoutes = require('./routes/besuche')
const erlebtMitRoutes = require('./routes/erlebtMit')
const wirWarenHierRoutes = require('./routes/wirWarenHier')
const membersRoutes = require('./routes/members')
const messagesRoutes = require('./routes/messages')
const partnersRoutes = require('./routes/partners')
const anfragenRoutes = require('./routes/anfragen')
const publicAnimalsRoutes = require('./routes/publicAnimals')
const placesRoutes = require('./routes/places')
const discoverRoutes = require('./routes/discover')
const partnerAreaRoutes = require('./routes/partnerArea')
const redirectRoutes = require('./routes/redirect')
const seoRoutes = require('./routes/seo')
const bilderrahmenRoutes = require('./routes/bilderrahmen')
const sucheRoutes = require('./routes/suche')
const startRoutes = require('./routes/start')
const tiereRoutes = require('./routes/tiere')
const schuetzlingeRoutes = require('./routes/schuetzlinge')
const pushRoutes = require('./routes/push')
const { rahmenApiRouter, rahmenFotoRouter, rahmenPageHeaders } = require('./routes/rahmen')
const { router: uploadsRoutes, MAX_FILE_BYTES } = require('./routes/uploads')
const { requireUploadAccess } = require('./middleware/admin')
const { denyAdminViewWrites } = require('./middleware/auth')
const { apiLimiter, photoLimiter, limitWrites } = require('./middleware/abuse')
const { LOGO_FILENAME_RE } = require('./lib/partners')
const { canServePublicMedia } = require('./lib/publicMedia')

const PHOTO_CACHE = 'private, max-age=2592000, immutable'
const PARTNER_LOGO_CACHE = 'public, max-age=2592000, immutable'
// Phase T Review Follow-up: neu revalidieren statt eine Stunde zu cachen, damit ein widerrufenes
// Einverständnis (story_consent, Steckbrief-Löschung) sofort greift statt bis zu 60 Minuten im Cache
// eines Browsers/Proxys zu überleben (dafür lohnt sich der ETag/If-None-Match-Roundtrip von express.static).
const PUBLIC_MEDIA_CACHE = 'public, no-cache'

// Ein Jahr, ohne preload und ohne includeSubDomains: der gemeinsame Server-Proxy bedient auch andere
// Projekte, die Vorschau läuft womöglich auf einer Sub-Domain - HSTS soll nur für genau diese Adresse gelten.
const HSTS_MAX_AGE_SECONDS = 365 * 24 * 60 * 60

// Kein upgrade-insecure-requests. HSTS (Phase G Task 2) nur, wenn die App laut PUBLIC_URL per https läuft -
// per http://IP:PORT ohne TLS würde der Header den Browser für ein Jahr aussperren.
const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", 'data:'],
      scriptSrc: ["'self'"],
      // Als App aufs Handy: der Service Worker (client/dist/sw.js) und das Web App Manifest - beide nur von hier.
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  strictTransportSecurity: config.httpsPublicUrl ? { maxAge: HSTS_MAX_AGE_SECONDS, includeSubDomains: false } : false,
  crossOriginOpenerPolicy: false,
  originAgentCluster: false
})

function errorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `Das Foto ist zu groß (max. ${MAX_FILE_BYTES / 1024 / 1024} MB)`
        : 'Upload fehlgeschlagen'
    return res.status(400).json({ error: message })
  }
  const status = err.status || err.statusCode || 500
  if (status >= 500) console.error(err)
  res.status(status).json({ error: status >= 500 ? 'Unerwarteter Serverfehler' : err.message })
}

// Service Worker, seine Dateiliste und die index.html immer neu prüfen lassen (no-cache): eine neue Version soll beim
// nächsten Öffnen ankommen, nicht erst nach der Cache-Stunde der übrigen Dateien (die gehashten unter /assets ändern
// sich nie, die Stunde ist dort nur ein Rückfall).
const FRESH_FILES = new Set(['sw.js', 'sw-assets.json', 'index.html'])
const FRESH_CACHE = 'no-cache'

function serveClient(app) {
  const indexHtml = path.join(config.clientDist, 'index.html')
  if (!fs.existsSync(indexHtml)) return

  app.use(
    express.static(config.clientDist, {
      index: false,
      maxAge: '1h',
      setHeaders: (res, filePath) => {
        if (FRESH_FILES.has(path.basename(filePath))) res.setHeader('Cache-Control', FRESH_CACHE)
      }
    })
  )
  app.get(/^\/(?!api\/|uploads\/|health$).*/, (req, res) => {
    res.sendFile(indexHtml, { cacheControl: false, headers: { 'Cache-Control': FRESH_CACHE } })
  })
}

function createApp() {
  const app = express()
  app.disable('x-powered-by')
  if (config.trustProxy) app.set('trust proxy', config.trustProxy)

  app.use(securityHeaders)
  if (config.corsOrigin) app.use(cors({ origin: config.corsOrigin, credentials: true }))
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())

  app.get('/health', (req, res) => {
    db.prepare('SELECT 1').get()
    res.json({ status: 'ok' })
  })

  // Fotos nur für Bereiche, die sie laut canSeeUpload auch sehen dürfen (oder Admin); "private",
  // damit keine geteilten Caches sie speichern
  app.use(
    '/uploads',
    photoLimiter,
    requireUploadAccess,
    express.static(config.uploadDir, {
      fallthrough: false,
      setHeaders: (res) => res.setHeader('Cache-Control', PHOTO_CACHE)
    })
  )

  // Partner-Logos: öffentlich (anders als /uploads), kein Login nötig - siehe routes/admin.js für den
  // Upload und lib/partners.js für Dateinamen-Regel (LOGO_FILENAME_RE) und Magic-Byte-Prüfung.
  app.use(
    '/partner-media',
    (req, res, next) => {
      if (!LOGO_FILENAME_RE.test(path.basename(req.path))) return res.status(404).json({ error: 'Nicht gefunden' })
      next()
    },
    express.static(config.partnerMediaDir, {
      fallthrough: false,
      setHeaders: (res) => res.setHeader('Cache-Control', PARTNER_LOGO_CACHE)
    })
  )

  // Steckbrief-Fotos (Phase T Task 2): kein Login, aber nur Dateien, die zu einem veröffentlichten
  // Steckbrief gehören (siehe lib/publicMedia.js) - alles andere 404, wie bei /uploads. noindex, weil
  // Steckbriefe nie in Suchmaschinen auftauchen sollen (Roadmap-Entscheidung 14); "public" statt
  // "private" im Cache-Control, anders als /uploads, weil diese Fotos absichtlich für alle gleich sind.
  app.use(
    '/public-media',
    photoLimiter,
    (req, res, next) => {
      res.setHeader('X-Robots-Tag', 'noindex')
      if (!canServePublicMedia(path.basename(req.path))) return res.status(404).json({ error: 'Nicht gefunden' })
      next()
    },
    express.static(config.uploadDir, {
      fallthrough: false,
      setHeaders: (res) => res.setHeader('Cache-Control', PUBLIC_MEDIA_CACHE)
    })
  )

  app.use('/api', apiLimiter)
  // Phase 5 Task 5b: die Admin-Ansicht (middleware/auth.js denyAdminViewWrites) ist nur lesend - VOR allen
  // Routern, damit auch Uploads abgelehnt werden, bevor multer eine Datei schreibt.
  app.use('/api', denyAdminViewWrites)
  app.use(['/api/dogs', '/api/timeline', '/api/notes', '/api/breeding', '/api/besuche', '/api/erlebt-mit', '/api/hinweise', '/api/wir-waren-hier'], limitWrites)
  // Phase R Task 2: /api/family/members VOR authRoutes (dort liegen /family und /family/key) - Express
  // matcht Router-Pfade zwar exakt, so bleibt die Reihenfolge aber unabhängig von künftigen Routen dort.
  app.use('/api/family/members', membersRoutes)
  app.use('/api', authRoutes)
  app.use('/api/vouchers', vouchersRoutes)
  // Phase V2: Zuhause besuchen (Einladungen, Einlösen, Besuche und Gäste beenden).
  app.use('/api/besuche', besucheRoutes)
  app.use('/api/erlebt-mit', erlebtMitRoutes)
  app.use('/api/wir-waren-hier', wirWarenHierRoutes)
  app.use('/api/dogs', dogsRoutes)
  app.use('/api/timeline', timelineRoutes)
  app.use('/api/breeding', breedingRoutes)
  app.use('/api/notes', notesRoutes)
  app.use('/api/messages', messagesRoutes)
  app.use('/api/admin', adminRoutes)
  app.use('/api/admin', adminMarketingRoutes)
  app.use('/api/admin', adminStatsRoutes)
  app.use('/api/admin', adminAnfragenRoutes)
  app.use('/api/admin', adminNotifyRoutes)
  app.use('/api/admin', adminTermineRoutes)
  // Audit V7a: einzelne Bannerfotos eines Partners entfernen.
  app.use('/api/admin', adminBannerRoutes)
  app.use('/api/admin', adminHinweiseRoutes)
  // Phase G Task 6: Admin-Reiter „Server“ (Speicher, Platte, Last, Verlauf) - nur lesend, no-store.
  app.use('/api/admin', adminServerRoutes)
  // Einladungskarten: die Rückseite, die Familie auf Pfoten für alle Partner gestaltet (Reiter „Einstellungen“).
  app.use('/api/admin', adminEinladungskarteRoutes)
  // Phase F: „So finanzieren wir uns“ - Spenden-Hinweis, Ziel und Quartale (Reiter „Finanzierung“) und der Schalter
  // „Überall sichtbar“ eines Partners (Partnerliste).
  app.use('/api/admin', adminFinanzierungRoutes)
  app.use('/api/admin', adminPartnerSichtbarRoutes)
  // Laufband der Startseite: Partner vorstellen und die Demo-Ausnahme (routes/adminCommunity.js).
  app.use('/api/admin', adminCommunityRoutes)
  // Phase N Task 5: die laufenden globalen Hinweise fürs Band oben auf jeder Seite - öffentlich, ohne Login.
  // Hinweis-Glocke (Grüße, gelesen) - Prüfung je Route, das öffentliche Band darunter bleibt ohne Login.
  app.use('/api/hinweise', meineHinweiseRoutes)
  app.use('/api/hinweise', hinweiseRoutes)
  // Phase F: die Zahlen für „So finanzieren wir uns“ - öffentlich, ohne Login, cachebar (routes/finanzierung.js).
  app.use('/api/finanzierung', finanzierungRoutes)
  // Laufband der Startseite: Zahlen aus der Gemeinschaft - öffentlich, ohne Login, cachebar (routes/community.js).
  app.use('/api/community', communityRoutes)
  app.use('/api/public/partners', partnersRoutes)
  // Phase N Task 1: Gutschein- und Partner-Anfragen (routes/anfragen.js) - vor dem allgemeinen /api/public.
  app.use('/api/public/anfragen', anfragenRoutes)
  app.use('/api/public', publicAnimalsRoutes)
  app.use('/api/places', placesRoutes)
  app.use('/api/discover', discoverRoutes)
  app.use('/api/partner-area', partnerAreaRoutes)
  app.use('/api/uploads', uploadsRoutes)
  // Digitaler Bilderrahmen: Diashow und Rahmen-Links (angemeldet) und die Fotoliste eines Rahmen-Geräts (ohne Sitzung,
  // Header X-Rahmen-Token) - routes/bilderrahmen.js, routes/rahmen.js.
  app.use('/api/bilderrahmen', bilderrahmenRoutes)
  app.use('/api/rahmen', rahmenApiRouter)
  // Suche über Tiere, Erinnerungen, Pinnwand, Familien und Partner - nur, was die Identität sehen darf (routes/suche.js).
  app.use('/api/suche', sucheRoutes)
  // Start: Neues aus dem eigenen Zuhause, den Familien und den befreundeten Zuhause - je Bereich mit dessen Regeln (routes/start.js).
  app.use('/api/start', startRoutes)
  // Alle Tiere aus Zuhause, Familien und befreundeten Zuhause an einem Ort - je Bereich mit dessen Regeln (routes/tiere.js).
  app.use('/api/tiere', tiereRoutes)
  // „So geht es euren Schützlingen“ - nur für Tierheime (routes/schuetzlinge.js)
  app.use('/api/schuetzlinge', schuetzlingeRoutes)
  // Benachrichtigungen aufs Handy (Web Push): Abos je Zuhause, öffentlicher VAPID-Schlüssel (routes/push.js, lib/push.js).
  app.use('/api/push', pushRoutes)
  app.use('/api', (req, res) => res.status(404).json({ error: 'Nicht gefunden' }))

  // Fotos eines Rahmen-Geräts über signierte, kurzlebige Adressen (routes/rahmen.js) und die Seite /rahmen selbst: beide
  // noindex und ohne Referrer - vor serveClient(), sonst beantwortet der Catch-all die Fotos mit index.html.
  app.use('/rahmen-foto', photoLimiter, rahmenFotoRouter)
  app.get('/rahmen', rahmenPageHeaders)

  // /r/:type/:id (Klickzählung, routes/redirect.js): unter apiLimiter wie der Rest der API, aber AUSSERHALB
  // von /api - der Link kann ohne Login/Session in einem neuen Tab geöffnet werden. Muss vor serveClient()
  // stehen, sonst würde die Client-Auslieferung unten (Catch-all für alles außer api/uploads/health) jede
  // /r/...-Anfrage stattdessen mit index.html beantworten.
  app.use('/r', apiLimiter, redirectRoutes)

  // /robots.txt und /sitemap.xml (Phase G Task 2, routes/seo.js): ebenfalls vor serveClient(), aus demselben Grund.
  app.use(seoRoutes)

  serveClient(app)
  app.use(errorHandler)
  return app
}

module.exports = { createApp }
