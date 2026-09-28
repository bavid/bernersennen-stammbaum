const express = require('express')
const multer = require('multer')
const { denyDemoWrites } = require('../../middleware/auth')
const { requireFreeDisk } = require('../../middleware/abuse')
const {
  uploadLimiter,
  createPhotoUpload,
  stripMetadataInPlace,
  hasMatchingSignature,
  removeUploadedFile,
  removeUploadByUrl,
  MAX_FILE_BYTES
} = require('../../lib/photoUpload')
const {
  MAX_EINBLICKE,
  LIMIT_MESSAGE,
  validateNewEinblick,
  validateEinblickUpdate,
  ownEinblick,
  countEinblicke,
  listOwnEinblicke,
  findOwnEinblick,
  insertEinblick,
  updateEinblick,
  deleteEinblick
} = require('../../lib/einblicke')

// Phase P Task 3b: Einblicke des eigenen Partners (lib/einblicke.js). Läuft hinter
// middleware/partnerArea.js requirePartnerArea (req.partner ist gesetzt). Fotos liegen wie Tierfotos in
// config.uploadDir (lib/photoUpload.js) - öffentlich über /public-media nur, solange der Partner sichtbar
// und der Einblick nicht ausgeblendet ist (lib/publicMedia.js).

const router = express.Router()

const NOT_FOUND = 'Diesen Einblick gibt es nicht'

// Felder: datum, text (<= 300 Zeichen, in UTF-8 bis gut 1 KB), einwilligung - plus das Foto.
const einblickUpload = createPhotoUpload({ fields: 3, fieldSize: 4096, parts: 4 })

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

function sendError(res, next, err) {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? `Das Foto ist zu groß (max. ${MAX_FILE_BYTES / 1024 / 1024} MB)` : 'Upload fehlgeschlagen'
    return res.status(400).json({ error: message })
  }
  if (err.status) return res.status(err.status).json({ error: err.message })
  next(err)
}

// Voll -> 409, bevor überhaupt ein Foto hochgeladen wird (die Transaktion in insertEinblick prüft es
// danach noch einmal verbindlich).
function rejectWhenFull(req, res, next) {
  if (countEinblicke(req.partner.id) >= MAX_EINBLICKE) return res.status(409).json({ error: LIMIT_MESSAGE })
  next()
}

router.get('/', (req, res) => {
  res.json(listOwnEinblicke(req.partner.id).map(ownEinblick))
})

// multipart: foto, datum, text, einwilligung. Jede Ablehnung nach dem Speichern durch multer entfernt die
// Datei wieder - eine fehlgeschlagene Prüfung hinterlässt nichts auf der Platte.
router.post('/', denyDemoWrites, uploadLimiter, requireFreeDisk, rejectWhenFull, (req, res, next) => {
  einblickUpload.single('foto')(req, res, (uploadErr) => {
    if (uploadErr) {
      removeUploadedFile(req.file)
      return sendError(res, next, uploadErr)
    }
    try {
      if (!req.file) throw httpError(400, 'Bitte wählt ein Foto aus.')
      const { datum, text } = validateNewEinblick(req.body)
      if (!hasMatchingSignature(req.file)) throw httpError(400, 'Nur Fotos (JPG, PNG, WebP, GIF) sind erlaubt')
      stripMetadataInPlace(req.file)
      const einblick = insertEinblick({ partner: req.partner, fotoUrl: `/uploads/${req.file.filename}`, datum, text })
      res.status(201).json(ownEinblick(einblick))
    } catch (err) {
      removeUploadedFile(req.file)
      sendError(res, next, err)
    }
  })
})

router.put('/:id', denyDemoWrites, (req, res, next) => {
  try {
    const einblick = findOwnEinblick(req.partner.id, req.params.id)
    if (!einblick) return res.status(404).json({ error: NOT_FOUND })
    res.json(ownEinblick(updateEinblick(einblick.id, validateEinblickUpdate(req.body))))
  } catch (err) {
    sendError(res, next, err)
  }
})

router.delete('/:id', denyDemoWrites, (req, res) => {
  const einblick = findOwnEinblick(req.partner.id, req.params.id)
  if (!einblick) return res.status(404).json({ error: NOT_FOUND })
  if (deleteEinblick(einblick)) removeUploadByUrl(einblick.foto_url)
  res.status(204).end()
})

module.exports = router
