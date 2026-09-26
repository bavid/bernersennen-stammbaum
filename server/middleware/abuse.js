const fs = require('node:fs')
const rateLimit = require('express-rate-limit')
const config = require('../config')
const { requireAuth } = require('./auth')

// Schutz gegen Spam, Brute-Force und versehentliches Fluten (keine Abwehr für
// volumetrische DDoS-Angriffe – die filtert der Hoster auf Netzwerkebene).

const FIVE_MINUTES = 5 * 60 * 1000
const TEN_MINUTES = 10 * 60 * 1000
const DEFAULT_MIN_FREE_DISK_MB = 1024
const BYTES_PER_MB = 1024 * 1024

const limiter = (options, message) =>
  rateLimit({ standardHeaders: 'draft-7', legacyHeaders: false, message: { error: message }, ...options })

// Alle API-Anfragen pro IP
const apiLimiter = limiter(
  { windowMs: FIVE_MINUTES, limit: config.apiRateLimit },
  'Zu viele Anfragen in kurzer Zeit – bitte einen Moment warten.'
)

// Fotos pro IP (großzügiger, eine Seite lädt viele Bilder)
const photoLimiter = limiter({ windowMs: FIVE_MINUTES, limit: config.photoRateLimit }, 'Zu viele Anfragen.')

const writeLimiter = limiter(
  { windowMs: TEN_MINUTES, limit: config.writeRateLimit, keyGenerator: (req) => `family-${req.familyId}` },
  'Sehr viele Änderungen in kurzer Zeit – bitte ein paar Minuten warten.'
)

// Schreibzugriffe pro Rudel begrenzen (GET bleibt frei)
function limitWrites(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next()
  return requireAuth(req, res, () => writeLimiter(req, res, next))
}

// Unsichtbares Formularfeld "website": Menschen sehen es nicht, Bots füllen es aus
function rejectHoneypot(req, res, next) {
  if (req.body?.website) return res.status(400).json({ error: 'Anfrage abgelehnt' })
  next()
}

// Keine Uploads mehr, wenn der Server-Speicher fast voll ist
function requireFreeDisk(req, res, next) {
  const minFreeMb = Number(process.env.MIN_FREE_DISK_MB ?? DEFAULT_MIN_FREE_DISK_MB)
  fs.statfs(config.uploadDir, (err, stats) => {
    if (err) return next()
    const freeMb = (stats.bavail * stats.bsize) / BYTES_PER_MB
    if (freeMb < minFreeMb) {
      return res.status(507).json({ error: 'Der Speicher des Servers ist fast voll – Uploads sind vorübergehend gesperrt.' })
    }
    next()
  })
}

module.exports = { apiLimiter, photoLimiter, limitWrites, rejectHoneypot, requireFreeDisk }
