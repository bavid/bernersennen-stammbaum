'use strict'

// Logo-Upload eines Partners - EINE Funktion für den Admin (routes/admin.js POST /partners/:id/logo) und
// den Partner selbst (routes/partnerArea/profile.js POST /profile/logo), damit beide dieselben Grenzen,
// Bild-Arten und dieselbe Metadaten-Entfernung haben. Server-vergebener Dateiname (nie der
// Client-Dateiname), Bild-Art per Magic-Bytes bestätigt (lib/partners.js detectImageExt) - SVG scheitert
// schon am fehlenden Signatur-Treffer (XSS-Risiko bei eingebettetem Skript in SVG).

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const multer = require('multer')
const db = require('../db')
const config = require('../config')
const { detectImageExt, LOGO_MIME_TYPES, MAX_LOGO_BYTES } = require('./partners')
const { stripJpegMetadata } = require('./stripJpegMetadata')
const { stripPngMetadata } = require('./stripPngMetadata')

const partnerLogoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO_BYTES, files: 1, fields: 0, parts: 2 }
})

// security-review Phase T Finding 12 gilt auch für Logos: EXIF/GPS aus JPEG, Text-/eXIf-Chunks aus PNG.
// WebP bleibt wie bei routes/uploads.js unangetastet (siehe Begründung dort).
const METADATA_STRIPPER_BY_EXT = { jpg: stripJpegMetadata, png: stripPngMetadata }

function stripLogoMetadata(buffer, ext) {
  const strip = METADATA_STRIPPER_BY_EXT[ext]
  return strip ? strip(buffer) : buffer
}

const findLogoFile = db.prepare('SELECT logo_file FROM partners WHERE id = ?')
const updateLogoFile = db.prepare('UPDATE partners SET logo_file = ? WHERE id = ?')

// Nimmt das Logo aus dem multipart-Feld "file" entgegen, speichert es unter config.partnerMediaDir,
// löscht das bisherige Logo und antwortet 201 { logoUrl }. partnerId muss schon geprüft sein.
function handlePartnerLogoUpload(req, res, next, partnerId) {
  partnerLogoUpload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? `Das Logo ist zu groß (max. ${MAX_LOGO_BYTES / 1024} KB)` : 'Upload fehlgeschlagen'
      return res.status(400).json({ error: message })
    }
    if (err) return next(err)
    if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' })

    const ext = detectImageExt(req.file.buffer)
    if (!ext || !LOGO_MIME_TYPES.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Nur PNG, JPG oder WebP sind als Logo erlaubt' })
    }

    fs.mkdirSync(config.partnerMediaDir, { recursive: true })
    const filename = `${crypto.randomUUID()}.${ext}`
    fs.writeFileSync(path.join(config.partnerMediaDir, filename), stripLogoMetadata(req.file.buffer, ext))

    // Das bisherige Logo erst jetzt frisch lesen (nicht vor dem Upload): so bleibt auch bei zwei
    // gleichzeitigen Uploads keine Datei verwaist zurück.
    const previous = findLogoFile.get(partnerId)?.logo_file
    updateLogoFile.run(filename, partnerId)
    if (previous) fs.rmSync(path.join(config.partnerMediaDir, previous), { force: true })
    res.status(201).json({ logoUrl: `/partner-media/${filename}` })
  })
}

module.exports = { handlePartnerLogoUpload, stripLogoMetadata }
