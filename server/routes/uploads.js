const express = require('express')
const db = require('../db')
const { requireAuth } = require('../middleware/auth')
const { requireFreeDisk } = require('../middleware/abuse')
const { MAX_FILE_BYTES, uploadLimiter, createPhotoUpload, stripMetadataInPlace } = require('../lib/photoUpload')

// Foto-Upload für Tiere/Chronik: MIME-Whitelist, Größe, Dateiname und Metadaten-Entfernung stecken in
// lib/photoUpload.js (dieselben Regeln gelten für Einblicke, routes/partnerArea/einblicke.js).

const router = express.Router()

const upload = createPhotoUpload({ fields: 5, fieldSize: 1024, parts: 6 })

const insertUpload = db.prepare('INSERT INTO uploads (filename, family_id) VALUES (?, ?)')

router.post('/', requireAuth, uploadLimiter, requireFreeDisk, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Keine Datei hochgeladen' })
  }
  stripMetadataInPlace(req.file)
  // Merkt sich, welcher Bereich die Datei erzeugt hat - so ist sie sofort sichtbar (canSeeUpload),
  // auch bevor sie überhaupt an einem Hund oder Eintrag hängt.
  insertUpload.run(req.file.filename, req.familyId)
  res.status(201).json({ url: `/uploads/${req.file.filename}` })
})

module.exports = { router, MAX_FILE_BYTES }
