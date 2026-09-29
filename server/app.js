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
const vouchersRoutes = require('./routes/vouchers')
const membersRoutes = require('./routes/members')
const messagesRoutes = require('./routes/messages')
const partnersRoutes = require('./routes/partners')
const publicAnimalsRoutes = require('./routes/publicAnimals')
const placesRoutes = require('./routes/places')
const discoverRoutes = require('./routes/discover')
const partnerAreaRoutes = require('./routes/partnerArea')
const redirectRoutes = require('./routes/redirect')
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

// Kein upgrade-insecure-requests/HSTS: die App läuft auch per http://IP:PORT ohne TLS.
const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", 'data:'],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  strictTransportSecurity: false,
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

function serveClient(app) {
  const indexHtml = path.join(config.clientDist, 'index.html')
  if (!fs.existsSync(indexHtml)) return

  app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }))
  app.get(/^\/(?!api\/|uploads\/|health$).*/, (req, res) => {
    res.sendFile(indexHtml)
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
  app.use(['/api/dogs', '/api/timeline', '/api/notes', '/api/breeding'], limitWrites)
  // Phase R Task 2: /api/family/members VOR authRoutes (dort liegen /family und /family/key) - Express
  // matcht Router-Pfade zwar exakt, so bleibt die Reihenfolge aber unabhängig von künftigen Routen dort.
  app.use('/api/family/members', membersRoutes)
  app.use('/api', authRoutes)
  app.use('/api/vouchers', vouchersRoutes)
  app.use('/api/dogs', dogsRoutes)
  app.use('/api/timeline', timelineRoutes)
  app.use('/api/breeding', breedingRoutes)
  app.use('/api/notes', notesRoutes)
  app.use('/api/messages', messagesRoutes)
  app.use('/api/admin', adminRoutes)
  app.use('/api/admin', adminMarketingRoutes)
  app.use('/api/admin', adminStatsRoutes)
  app.use('/api/public/partners', partnersRoutes)
  app.use('/api/public', publicAnimalsRoutes)
  app.use('/api/places', placesRoutes)
  app.use('/api/discover', discoverRoutes)
  app.use('/api/partner-area', partnerAreaRoutes)
  app.use('/api/uploads', uploadsRoutes)
  app.use('/api', (req, res) => res.status(404).json({ error: 'Nicht gefunden' }))

  // /r/:type/:id (Klickzählung, routes/redirect.js): unter apiLimiter wie der Rest der API, aber AUSSERHALB
  // von /api - der Link kann ohne Login/Session in einem neuen Tab geöffnet werden. Muss vor serveClient()
  // stehen, sonst würde die Client-Auslieferung unten (Catch-all für alles außer api/uploads/health) jede
  // /r/...-Anfrage stattdessen mit index.html beantworten.
  app.use('/r', apiLimiter, redirectRoutes)

  serveClient(app)
  app.use(errorHandler)
  return app
}

module.exports = { createApp }
