const crypto = require('node:crypto')
const fs = require('node:fs')
const express = require('express')
const multer = require('multer')
const rateLimit = require('express-rate-limit')
const db = require('../db')
const { requireAuth } = require('../middleware/auth')
const { requireFreeDisk } = require('../middleware/abuse')
const { uploadDir, uploadRateLimit } = require('../config')

const router = express.Router()

const MAX_FILE_BYTES = 15 * 1024 * 1024

// Dateiendung kommt ausschließlich aus dieser Whitelist, nie vom Client-Dateinamen.
const EXTENSION_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
}

// Schützt den gemeinsamen Speicher: Uploads pro Rudel und Stunde begrenzen
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: uploadRateLimit,
  keyGenerator: (req) => `family-${req.familyId}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Zu viele Fotos in kurzer Zeit. Bitte später weitermachen.' }
})

fs.mkdirSync(uploadDir, { recursive: true })

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}.${EXTENSION_BY_MIME[file.mimetype]}`)
  }),
  limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 5, fieldSize: 1024, parts: 6 },
  fileFilter: (req, file, cb) => {
    if (!EXTENSION_BY_MIME[file.mimetype]) {
      const error = new Error('Nur Fotos (JPG, PNG, WebP, GIF) sind erlaubt')
      error.status = 400
      return cb(error)
    }
    cb(null, true)
  }
})

const insertUpload = db.prepare('INSERT INTO uploads (filename, family_id) VALUES (?, ?)')

router.post('/', requireAuth, uploadLimiter, requireFreeDisk, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Keine Datei hochgeladen' })
  }
  // Merkt sich, welcher Bereich die Datei erzeugt hat - so ist sie sofort sichtbar (canSeeUpload),
  // auch bevor sie überhaupt an einem Hund oder Eintrag hängt.
  insertUpload.run(req.file.filename, req.familyId)
  res.status(201).json({ url: `/uploads/${req.file.filename}` })
})

module.exports = { router, MAX_FILE_BYTES }
