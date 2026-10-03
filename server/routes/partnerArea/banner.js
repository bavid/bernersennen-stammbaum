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
  MAX_BANNER,
  FULL_MESSAGE,
  NOT_FOUND_MESSAGE,
  validateAlt,
  validateBannerUpdate,
  parsePosition,
  ownBanner,
  listBanner,
  countBanner,
  addBanner,
  replaceBanner,
  updateBannerAlt,
  deleteBanner
} = require('../../lib/partnerBanner')

// Phase V4b: Bannerfotos des eigenen Partners (lib/partnerBanner.js) unter /api/partner-area/profile/banner. Läuft
// hinter middleware/partnerArea.js requirePartnerArea (req.partner ist gesetzt). Dieselbe Upload-Strecke wie die
// Einblicke (routes/partnerArea/einblicke.js): nur JPG/PNG (nur für diese entfernt lib/photoUpload.js die Metadaten),
// Content-Type UND Magic Bytes geprüft, Upload-Limit je Bereich, freier Speicher. Jede Antwort ist die eigene Liste
// { banner: [{ position, fotoUrl, alt }] }. Demo-Sitzungen lesen nur.

const router = express.Router()

const BANNER_MIME_TYPES = ['image/jpeg', 'image/png']
const BANNER_EXTS = ['jpg', 'png']
const TYPE_MESSAGE = 'Bitte als JPG oder PNG hochladen.'

// Felder: alt (<= 120 Zeichen, in UTF-8 knapp 500 Bytes) - plus das Foto.
const bannerUpload = createPhotoUpload({ fields: 1, fieldSize: 1024, parts: 2 }, { mimeTypes: BANNER_MIME_TYPES, typeError: TYPE_MESSAGE })

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

function sendList(res, partnerId, status = 200) {
  res.status(status).json({ banner: listBanner(partnerId).map(ownBanner) })
}

// Nimmt das Foto (Feld "foto") entgegen, prüft es und ruft store({ fotoUrl, alt }) auf. Jede Ablehnung nach dem
// Speichern durch multer entfernt die Datei wieder - eine fehlgeschlagene Prüfung hinterlässt nichts auf der Platte.
function receivePhoto(req, res, next, store) {
  bannerUpload.single('foto')(req, res, (uploadErr) => {
    if (uploadErr) {
      removeUploadedFile(req.file)
      return sendError(res, next, uploadErr)
    }
    try {
      if (!req.file) throw httpError(400, 'Bitte wählt ein Foto aus.')
      const alt = validateAlt(req.body?.alt)
      if (!hasMatchingSignature(req.file, BANNER_EXTS)) throw httpError(400, TYPE_MESSAGE)
      stripMetadataInPlace(req.file)
      store({ fotoUrl: `/uploads/${req.file.filename}`, alt })
    } catch (err) {
      removeUploadedFile(req.file)
      sendError(res, next, err)
    }
  })
}

// Voll -> 409, bevor überhaupt ein Foto hochgeladen wird (addBanner prüft es danach noch einmal verbindlich).
function rejectWhenFull(req, res, next) {
  if (countBanner(req.partner.id) >= MAX_BANNER) return res.status(409).json({ error: FULL_MESSAGE })
  next()
}

// Unbekannte oder leere Position -> 404, ebenfalls vor dem Upload.
function requireExistingPosition(req, res, next) {
  const position = parsePosition(req.params.position)
  if (!position || !listBanner(req.partner.id).some((row) => row.position === position)) {
    return res.status(404).json({ error: NOT_FOUND_MESSAGE })
  }
  req.bannerPosition = position
  next()
}

router.get('/', (req, res) => {
  sendList(res, req.partner.id)
})

// multipart: foto, alt? - an die nächste freie Stelle.
router.post('/', denyDemoWrites, uploadLimiter, requireFreeDisk, rejectWhenFull, (req, res, next) => {
  receivePhoto(req, res, next, ({ fotoUrl, alt }) => {
    addBanner({ partner: req.partner, fotoUrl, alt })
    sendList(res, req.partner.id, 201)
  })
})

// multipart: foto, alt? - ersetzt das Foto an :position; die alte Datei verschwindet danach.
router.put('/:position/foto', denyDemoWrites, uploadLimiter, requireFreeDisk, requireExistingPosition, (req, res, next) => {
  receivePhoto(req, res, next, ({ fotoUrl, alt }) => {
    const { previousUrl } = replaceBanner({ partnerId: req.partner.id, position: req.bannerPosition, fotoUrl, alt })
    removeUploadByUrl(previousUrl)
    sendList(res, req.partner.id)
  })
})

// { alt } - nur der Alternativtext.
router.put('/:position', denyDemoWrites, (req, res, next) => {
  try {
    const position = parsePosition(req.params.position)
    const alt = validateBannerUpdate(req.body)
    if (!position || !updateBannerAlt(req.partner.id, position, alt)) return res.status(404).json({ error: NOT_FOUND_MESSAGE })
    sendList(res, req.partner.id)
  } catch (err) {
    sendError(res, next, err)
  }
})

router.delete('/:position', denyDemoWrites, (req, res) => {
  const position = parsePosition(req.params.position)
  const removedUrl = position ? deleteBanner(req.partner.id, position) : null
  if (!removedUrl) return res.status(404).json({ error: NOT_FOUND_MESSAGE })
  removeUploadByUrl(removedUrl)
  sendList(res, req.partner.id)
})

module.exports = router
