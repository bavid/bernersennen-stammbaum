'use strict'

// Bild einer Empfehlung/Anzeige - EINE Upload-Strecke für den Admin (routes/adminMarketing.js POST
// /promotions/:id/image) und die Beiträge der Partner (routes/partnerArea/posts.js POST /posts/:id/image,
// Phase P2 Task 8), damit beide dieselben Grenzen, Bild-Arten und dieselbe Metadaten-Entfernung haben. Wie
// das Partner-Logo (lib/partnerLogo.js): server-vergebener Dateiname, Bild-Art per Magic-Bytes bestätigt
// (SVG scheitert am fehlenden Signatur-Treffer), EXIF-/PNG-Metadaten raus (security-review Phase T Finding
// 12 - Anzeigenbilder können ebenso von einem Handy stammen wie Tierfotos), Ablage im öffentlichen
// partner-media-Ordner.

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const multer = require('multer')
const db = require('../db')
const config = require('../config')
const { detectImageExt, LOGO_MIME_TYPES, MAX_LOGO_BYTES } = require('./partners')
const { stripLogoMetadata } = require('./partnerLogo')
const { promotionImageUrl, FREIGABE } = require('./promotions')

const promotionImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO_BYTES, files: 1, fields: 0, parts: 2 }
})

const findImageFile = db.prepare('SELECT bild_file FROM promotions WHERE id = ?')
const updateImageFile = db.prepare('UPDATE promotions SET bild_file = ? WHERE id = ?')
// Ein neues Bild eines Partner-Beitrags ist eine Änderung - wieder einreichen, Ablehnungsgrund weg.
const updateImageFileAndResubmit = db.prepare(
  `UPDATE promotions SET bild_file = ?, freigabe = '${FREIGABE.eingereicht}', ablehnungsgrund = NULL WHERE id = ?`
)

function removePromotionImage(bildFile) {
  if (bildFile) fs.rmSync(path.join(config.partnerMediaDir, bildFile), { force: true })
}

// Nimmt das Bild aus dem multipart-Feld "file" entgegen, speichert es, ersetzt das bisherige und antwortet
// 201 { bildUrl } - oder über respond(bildUrl), wenn der Aufrufer eine andere Antwort braucht. promotionId
// muss schon geprüft sein. resubmit: true setzt die Freigabe zurück auf 'eingereicht' (Partner-Beiträge).
function handlePromotionImageUpload(req, res, next, promotionId, { resubmit = false, respond } = {}) {
  promotionImageUpload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? `Das Bild ist zu groß (max. ${MAX_LOGO_BYTES / 1024} KB)` : 'Upload fehlgeschlagen'
      return res.status(400).json({ error: message })
    }
    if (err) return next(err)
    if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' })

    const ext = detectImageExt(req.file.buffer)
    if (!ext || !LOGO_MIME_TYPES.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Nur PNG, JPG oder WebP sind als Bild erlaubt' })
    }

    fs.mkdirSync(config.partnerMediaDir, { recursive: true })
    const filename = `${crypto.randomUUID()}.${ext}`
    fs.writeFileSync(path.join(config.partnerMediaDir, filename), stripLogoMetadata(req.file.buffer, ext))

    // Das bisherige Bild erst jetzt frisch lesen (nicht vor dem Upload): so bleibt auch bei zwei
    // gleichzeitigen Uploads keine Datei verwaist zurück.
    const previous = findImageFile.get(promotionId)?.bild_file
    const { changes } = (resubmit ? updateImageFileAndResubmit : updateImageFile).run(filename, promotionId)
    // Während des Uploads gelöscht: die neue Datei nicht verwaist liegen lassen.
    if (!changes) {
      removePromotionImage(filename)
      return res.status(404).json({ error: 'Nicht gefunden' })
    }
    removePromotionImage(previous)

    const bildUrl = promotionImageUrl(filename)
    if (respond) return respond(bildUrl)
    res.status(201).json({ bildUrl })
  })
}

module.exports = { handlePromotionImageUpload, removePromotionImage }
