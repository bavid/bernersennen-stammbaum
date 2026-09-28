'use strict'

// Foto-Upload auf die Platte (config.uploadDir) - gemeinsam für routes/uploads.js (Tierfotos, Chronik) und
// routes/partnerArea/einblicke.js (Einblicke): dieselbe MIME-Whitelist, dieselbe Größengrenze, derselbe
// server-vergebene Dateiname und dieselbe Metadaten-Entfernung.

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const multer = require('multer')
const rateLimit = require('express-rate-limit')
const { uploadDir, uploadRateLimit } = require('../config')
const { detectImageExt } = require('./partners')
const { stripJpegMetadata } = require('./stripJpegMetadata')
const { stripPngMetadata } = require('./stripPngMetadata')

const MAX_FILE_BYTES = 15 * 1024 * 1024

// Dateiendung kommt ausschließlich aus dieser Whitelist, nie vom Client-Dateinamen.
const EXTENSION_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
}

// Schützt den gemeinsamen Speicher: Uploads pro Bereich und Stunde begrenzen (EIN Zähler für alle
// Foto-Uploads eines Bereichs, egal über welche Route).
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: uploadRateLimit,
  keyGenerator: (req) => `family-${req.familyId}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Zu viele Fotos in kurzer Zeit. Bitte später weitermachen.' }
})

// multer-Instanz für EIN Foto; limits ergänzt/überschreibt die Grenzen für Textfelder (fields, fieldSize,
// parts) je nach Formular.
function createPhotoUpload(limits = {}) {
  fs.mkdirSync(uploadDir, { recursive: true })
  return multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}.${EXTENSION_BY_MIME[file.mimetype]}`)
    }),
    limits: { fileSize: MAX_FILE_BYTES, files: 1, ...limits },
    fileFilter: (req, file, cb) => {
      if (!EXTENSION_BY_MIME[file.mimetype]) {
        const error = new Error('Nur Fotos (JPG, PNG, WebP, GIF) sind erlaubt')
        error.status = 400
        return cb(error)
      }
      cb(null, true)
    }
  })
}

// security-review Phase T Finding 12: Handyfotos tragen oft EXIF-/GPS-Metadaten - vor dem Speichern
// entfernen (siehe lib/stripJpegMetadata.js/lib/stripPngMetadata.js). WebP bleibt bewusst unangetastet:
// der RIFF-Chunk-Aufbau (inkl. optionaler Padding-Bytes und verschachtelter VP8X/EXIF/XMP-Chunks) ist
// deutlich fehleranfälliger als JPEG/PNG für einen schnellen, sicheren Walker - lieber ein WebP mit
// Metadaten behalten als eines beschädigen. GIF trägt praktisch nie GPS-/Kamera-Metadaten (kein EXIF-
// Container im Format) und bleibt deshalb ebenfalls unangetastet.
const METADATA_STRIPPER_BY_MIME = {
  'image/jpeg': stripJpegMetadata,
  'image/png': stripPngMetadata
}

const filePathOf = (file) => path.join(uploadDir, file.filename)

// Liest die gerade von multer gespeicherte Datei, entfernt bekannte Metadaten-Segmente und schreibt sie
// nur zurück, wenn sich tatsächlich etwas geändert hat. Jeder Fehler (Lesen/Schreiben, unerwartete
// Bytes) lässt die Originaldatei unangetastet - nie eine Anfrage an einem Metadaten-Problem scheitern
// lassen, und nie Bildinhalte oder Dateipfade dabei loggen.
function stripMetadataInPlace(file) {
  const strip = METADATA_STRIPPER_BY_MIME[file.mimetype]
  if (!strip) return
  try {
    const original = fs.readFileSync(filePathOf(file))
    const stripped = strip(original)
    if (!stripped.equals(original)) fs.writeFileSync(filePathOf(file), stripped)
  } catch {
    // Original bleibt stehen - siehe Kommentar oben.
  }
}

const GIF_SIGNATURES = ['GIF87a', 'GIF89a']

function detectPhotoExt(buffer) {
  const ext = detectImageExt(buffer)
  if (ext) return ext
  return buffer.length >= 6 && GIF_SIGNATURES.includes(buffer.toString('ascii', 0, 6)) ? 'gif' : null
}

// Für ÖFFENTLICHE Fotos (Einblicke): passt der Inhalt (Magic Bytes) zur behaupteten Bild-Art? Der
// Content-Type kommt vom Client und beweist nichts - eine beliebige Datei soll nicht als "Foto" öffentlich
// ausgeliefert werden.
function hasMatchingSignature(file) {
  try {
    return detectPhotoExt(fs.readFileSync(filePathOf(file))) === EXTENSION_BY_MIME[file.mimetype]
  } catch {
    return false
  }
}

function removeUploadedFile(file) {
  if (file?.filename) fs.rmSync(filePathOf(file), { force: true })
}

// Entfernt die Datei hinter einer /uploads/-Adresse (nur der Dateiname zählt - nie ein Pfad).
function removeUploadByUrl(url) {
  if (typeof url === 'string' && url) removeUploadedFile({ filename: path.basename(url) })
}

module.exports = {
  MAX_FILE_BYTES,
  EXTENSION_BY_MIME,
  uploadLimiter,
  createPhotoUpload,
  stripMetadataInPlace,
  hasMatchingSignature,
  removeUploadedFile,
  removeUploadByUrl
}
