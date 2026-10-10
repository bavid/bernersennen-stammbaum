const express = require('express')
const path = require('node:path')
const fs = require('node:fs')
const { uploadDir } = require('../config')
const { requireAuth } = require('../middleware/auth')
const { requireFreeDisk } = require('../middleware/abuse')
const { cleanId } = require('../lib/validate')
const { requireRole } = require('../lib/roles')
const {
  uploadLimiter,
  createPhotoUpload,
  stripMetadataInPlace,
  hasMatchingSignature,
  assertPublishablePhoto,
  removeUploadedFile
} = require('../lib/photoUpload')
const { savePersonName, saveRundgang, bildUrl, bildFileOf, replaceBild, canHaveBild, canSeeBild } = require('../lib/profil')

// Profil (lib/profil.js): „Euer Name“ der angemeldeten Person und das Bild des aktiven Zuhauses bzw. der aktiven Familie.
// Schreiben: requireAuth sperrt Demo, Admin-Ansicht (app.js) und Besuche (lib/guestAccess.js); das Bild ändert nur die
// Leitung (im eigenen Zuhause ist man das immer). Hochladen über dieselbe Strecke wie alle Fotos (lib/photoUpload.js:
// Whitelist, Größe, server-vergebener Name, Metadaten weg, Maße geprüft) - aber ohne uploads-Zeile.
const router = express.Router()

const upload = createPhotoUpload({ fields: 0, parts: 1 })
const BILD_EXTS = ['jpg', 'png', 'webp']
const NOT_AN_IMAGE = 'Nur Fotos (JPG, PNG, WebP) sind als Bild erlaubt'
const NO_BILD_HERE = 'Ein Bild gibt es nur für ein Zuhause oder eine Familie'
const CONTENT_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

router.put('/name', requireAuth, (req, res, next) => {
  try {
    res.json(savePersonName(req.homeId, req.userId, req.body?.anzeigename))
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

// Rundgang (lib/profil.js): Stand je Zuhause - Demo, Admin-Ansicht und Besuche sperrt requireAuth bzw. app.js.
router.put('/rundgang', requireAuth, (req, res, next) => {
  try {
    res.json(saveRundgang(req.homeId, req.body?.status))
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

function requireBildArea(req, res, next) {
  if (!canHaveBild(req.familyId)) return res.status(400).json({ error: NO_BILD_HERE })
  next()
}

function removeBildFile(filename) {
  if (filename) removeUploadedFile({ filename })
}

// Prüft die gespeicherte Datei (Metadaten, Bild-Art per Magic Bytes, Maße) - wirft 400, der Aufrufer löscht sie dann.
function checkStoredBild(file) {
  stripMetadataInPlace(file)
  if (!hasMatchingSignature(file, BILD_EXTS)) {
    const err = new Error(NOT_AN_IMAGE)
    err.status = 400
    throw err
  }
  assertPublishablePhoto(file)
}

const bildWriters = [requireAuth, requireBildArea, requireRole('leitung')]

router.post('/bild', ...bildWriters, uploadLimiter, requireFreeDisk, upload.single('file'), (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' })
  try {
    checkStoredBild(req.file)
  } catch (err) {
    removeUploadedFile(req.file)
    return err.status ? res.status(err.status).json({ error: err.message }) : next(err)
  }
  removeBildFile(replaceBild(req.familyId, req.file.filename))
  res.status(201).json({ bild: bildUrl(req.familyId) })
})

router.delete('/bild', ...bildWriters, (req, res) => {
  removeBildFile(replaceBild(req.familyId, null))
  res.json({ bild: null })
})

// Nur für Berechtigte (canSeeBild), sonst 404 - wie ein Foto, das es nicht gibt.
router.get('/:id/bild', requireAuth, (req, res) => {
  const id = cleanId(req.params.id)
  const file = id && canSeeBild(req, id) ? bildFileOf(id) : null
  const ext = file ? path.extname(file).slice(1) : ''
  const fullPath = file ? path.join(uploadDir, path.basename(file)) : null
  if (!fullPath || !CONTENT_TYPES[ext] || !fs.existsSync(fullPath)) return res.status(404).json({ error: 'Nicht gefunden' })
  res.set('Cache-Control', 'private, max-age=86400')
  res.type(CONTENT_TYPES[ext])
  res.sendFile(fullPath, { cacheControl: false })
})

module.exports = router
