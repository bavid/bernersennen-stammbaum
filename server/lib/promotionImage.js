'use strict'

// Bild einer Empfehlung/Anzeige - EINE Upload-Strecke für den Admin (routes/adminMarketing.js POST
// /promotions/:id/image) und die Beiträge der Partner (routes/partnerArea/posts.js POST /posts/:id/image,
// Phase P2 Task 8), damit beide dieselben Grenzen und dieselbe Metadaten-Entfernung haben. Wie das
// Partner-Logo (lib/partnerLogo.js): server-vergebener Dateiname, Bild-Art per Magic-Bytes bestätigt
// (SVG scheitert am fehlenden Signatur-Treffer), EXIF-/PNG-Metadaten raus (security-review Phase T Finding
// 12 - Anzeigenbilder können ebenso von einem Handy stammen wie Tierfotos), Ablage im öffentlichen
// partner-media-Ordner. Dazu das Löschen einer Empfehlung samt Bild und Klickzählung (deletePromotion).

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const multer = require('multer')
const db = require('../db')
const config = require('../config')
const { detectImageExt, LOGO_MIME_TYPES, MAX_LOGO_BYTES } = require('./partners')
const { stripLogoMetadata } = require('./partnerLogo')
const { promotionImageUrl } = require('./promotions')

// Bild-Arten: der Admin darf PNG, JPG und WebP (wie beim Logo). Partner nur JPG und PNG - nur für diese
// beiden entfernt stripLogoMetadata die Metadaten (EXIF/GPS), WebP bliebe unangetastet (wie bei den
// Einblicken, routes/partnerArea/einblicke.js). Geprüft wird Content-Type UND Magic Bytes.
const ADMIN_IMAGE_TYPES = Object.freeze({
  mimeTypes: LOGO_MIME_TYPES,
  exts: ['png', 'jpg', 'webp'],
  typeError: 'Nur PNG, JPG oder WebP sind als Bild erlaubt'
})
const PARTNER_IMAGE_TYPES = Object.freeze({
  mimeTypes: ['image/jpeg', 'image/png'],
  exts: ['jpg', 'png'],
  typeError: 'Bitte als JPG oder PNG hochladen.'
})

const promotionImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO_BYTES, files: 1, fields: 0, parts: 2 }
})

const findImageFile = db.prepare('SELECT bild_file FROM promotions WHERE id = ?')
const updateImageFile = db.prepare('UPDATE promotions SET bild_file = ? WHERE id = ?')
const deleteClicksStmt = db.prepare("DELETE FROM link_clicks WHERE target_type = 'promotion' AND target_id = ?")
const deletePromotionStmt = db.prepare('DELETE FROM promotions WHERE id = ?')

function removePromotionImage(bildFile) {
  if (bildFile) fs.rmSync(path.join(config.partnerMediaDir, bildFile), { force: true })
}

// Empfehlung samt Klickzählung (link_clicks, target_type 'promotion') in einer Transaktion, danach das Bild
// von der Platte - für den Admin und die Beiträge der Partner. row braucht id und bild_file.
const deletePromotionRows = db.transaction((id) => {
  deleteClicksStmt.run(id)
  deletePromotionStmt.run(id)
})

function deletePromotion(row) {
  deletePromotionRows(row.id)
  removePromotionImage(row.bild_file)
}

// Das bisherige Bild erst hier frisch lesen (nicht vor dem Upload): so bleibt auch bei zwei gleichzeitigen Uploads
// keine Datei verwaist zurück. onStored (optional) läuft in derselben Transaktion - z. B. die Freigabe eines
// Partner-Beitrags (lib/partnerPosts.js applyPartnerEdit). null, wenn es die Empfehlung nicht (mehr) gibt.
const storeImageFile = db.transaction((promotionId, filename, onStored) => {
  const previous = findImageFile.get(promotionId)?.bild_file
  const { changes } = updateImageFile.run(filename, promotionId)
  if (!changes) return null
  return { previous, stored: onStored ? onStored(promotionId) : undefined }
})

// Nimmt das Bild aus dem multipart-Feld "file" entgegen, speichert es, ersetzt das bisherige und antwortet
// 201 { bildUrl } - oder über respond(bildUrl, stored), wenn der Aufrufer eine andere Antwort braucht. promotionId
// muss schon geprüft sein. onStored(promotionId) läuft mit dem Speichern in einer Transaktion, sein Ergebnis kommt
// als stored an respond (Partner-Beiträge: Freigabe und Verlauf, V-Fehler 3); types: ADMIN_IMAGE_TYPES (Vorgabe)
// oder PARTNER_IMAGE_TYPES. Die Datei liegt bis zur bestandenen Prüfung nur im Speicher - eine Ablehnung
// hinterlässt nichts auf der Platte.
function handlePromotionImageUpload(req, res, next, promotionId, { onStored, respond, types = ADMIN_IMAGE_TYPES } = {}) {
  promotionImageUpload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? `Das Bild ist zu groß (max. ${MAX_LOGO_BYTES / 1024} KB)` : 'Upload fehlgeschlagen'
      return res.status(400).json({ error: message })
    }
    if (err) return next(err)
    if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' })

    const ext = detectImageExt(req.file.buffer)
    if (!types.exts.includes(ext) || !types.mimeTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: types.typeError })
    }

    fs.mkdirSync(config.partnerMediaDir, { recursive: true })
    const filename = `${crypto.randomUUID()}.${ext}`
    fs.writeFileSync(path.join(config.partnerMediaDir, filename), stripLogoMetadata(req.file.buffer, ext))

    let result
    try {
      result = storeImageFile(promotionId, filename, onStored)
    } catch (storeErr) {
      removePromotionImage(filename)
      return next(storeErr)
    }
    // Während des Uploads gelöscht: die neue Datei nicht verwaist liegen lassen.
    if (!result) {
      removePromotionImage(filename)
      return res.status(404).json({ error: 'Nicht gefunden' })
    }
    removePromotionImage(result.previous)

    const bildUrl = promotionImageUrl(filename)
    if (respond) return respond(bildUrl, result.stored)
    res.status(201).json({ bildUrl })
  })
}

module.exports = { handlePromotionImageUpload, deletePromotion, removePromotionImage, ADMIN_IMAGE_TYPES, PARTNER_IMAGE_TYPES }
