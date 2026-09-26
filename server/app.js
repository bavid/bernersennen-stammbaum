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
const messagesRoutes = require('./routes/messages')
const { router: uploadsRoutes, MAX_FILE_BYTES } = require('./routes/uploads')
const { requireFamilyOrAdmin } = require('./middleware/admin')
const { apiLimiter, photoLimiter, limitWrites } = require('./middleware/abuse')

const PHOTO_CACHE = 'private, max-age=2592000, immutable'

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

  // Fotos nur mit Login (Rudel oder Admin); "private", damit keine geteilten Caches sie speichern
  app.use(
    '/uploads',
    photoLimiter,
    requireFamilyOrAdmin,
    express.static(config.uploadDir, {
      fallthrough: false,
      setHeaders: (res) => res.setHeader('Cache-Control', PHOTO_CACHE)
    })
  )

  app.use('/api', apiLimiter)
  app.use(['/api/dogs', '/api/timeline', '/api/notes', '/api/breeding'], limitWrites)
  app.use('/api', authRoutes)
  app.use('/api/dogs', dogsRoutes)
  app.use('/api/timeline', timelineRoutes)
  app.use('/api/breeding', breedingRoutes)
  app.use('/api/notes', notesRoutes)
  app.use('/api/messages', messagesRoutes)
  app.use('/api/admin', adminRoutes)
  app.use('/api/uploads', uploadsRoutes)
  app.use('/api', (req, res) => res.status(404).json({ error: 'Nicht gefunden' }))

  serveClient(app)
  app.use(errorHandler)
  return app
}

module.exports = { createApp }
