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
const { inspectImage } = require('./imageInspect')
const { stripJpegMetadata } = require('./stripJpegMetadata')
const { stripPngMetadata } = require('./stripPngMetadata')
const { stripWebpMetadata } = require('./stripWebpMetadata')

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

const ALL_PHOTO_MIME_TYPES = Object.keys(EXTENSION_BY_MIME)
const DEFAULT_TYPE_ERROR = 'Nur Fotos (JPG, PNG, WebP, GIF) sind erlaubt'

// multer-Instanz für EIN Foto; limits ergänzt/überschreibt die Grenzen für Textfelder (fields, fieldSize,
// parts) je nach Formular. mimeTypes/typeError: engere Auswahl für eine einzelne Route (z. B. Einblicke nur
// JPG/PNG) - Standard ist die ganze Whitelist.
function createPhotoUpload(limits = {}, { mimeTypes = ALL_PHOTO_MIME_TYPES, typeError = DEFAULT_TYPE_ERROR } = {}) {
  fs.mkdirSync(uploadDir, { recursive: true })
  return multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}.${EXTENSION_BY_MIME[file.mimetype]}`)
    }),
    limits: { fileSize: MAX_FILE_BYTES, files: 1, ...limits },
    fileFilter: (req, file, cb) => {
      if (!EXTENSION_BY_MIME[file.mimetype] || !mimeTypes.includes(file.mimetype)) {
        const error = new Error(typeError)
        error.status = 400
        return cb(error)
      }
      cb(null, true)
    }
  })
}

// security-review Phase T Finding 12: Handyfotos tragen oft EXIF-/GPS-Metadaten - vor dem Speichern
// entfernen (siehe lib/stripJpegMetadata.js, lib/stripPngMetadata.js, lib/stripWebpMetadata.js). GIF trägt
// praktisch nie GPS-/Kamera-Metadaten (kein EXIF-Container im Format) und bleibt deshalb unangetastet.
const METADATA_STRIPPER_BY_MIME = {
  'image/jpeg': stripJpegMetadata,
  'image/png': stripPngMetadata,
  'image/webp': stripWebpMetadata
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

// Für ÖFFENTLICHE Fotos (Einblicke): passt der Inhalt (Magic Bytes) zur behaupteten Bild-Art, und ist
// es eine der erlaubten Arten (allowedExts, Endungen wie in EXTENSION_BY_MIME)? Der Content-Type kommt vom
// Client und beweist nichts - eine beliebige Datei soll nicht als "Foto" öffentlich ausgeliefert werden.
function hasMatchingSignature(file, allowedExts = Object.values(EXTENSION_BY_MIME)) {
  try {
    const ext = detectPhotoExt(fs.readFileSync(filePathOf(file)))
    return allowedExts.includes(ext) && ext === EXTENSION_BY_MIME[file.mimetype]
  } catch {
    return false
  }
}

// security-review V4b (Bannerfotos), seit Audit V7a auch für Einblicke: öffentliche Fotos stehen auf dem Portal - riesige
// Maße (wenige Bytes, aber Gigabytes im Browser) und nicht entfernbare Metadaten (Aufnahmeort) werden abgelehnt. Aufruf
// NACH stripMetadataInPlace: die Stripper behalten bei unerwarteter Struktur das Original ("fail open") - was dann noch
// Metadaten trägt oder sich nicht lesen lässt, wird hier abgelehnt statt veröffentlicht (lib/imageInspect.js).
const MAX_PUBLIC_SIDE = 8000
const MAX_PUBLIC_PIXELS = 40_000_000
const UNREADABLE_MESSAGE = 'Dieses Foto lässt sich nicht lesen – bitte als JPG oder PNG neu speichern.'
const TOO_LARGE_MESSAGE = `Das Foto ist zu groß – höchstens ${MAX_PUBLIC_SIDE} × ${MAX_PUBLIC_SIDE} Pixel.`
const METADATA_MESSAGE = 'Die Foto-Daten (z. B. der Aufnahmeort) ließen sich nicht entfernen – bitte das Foto neu speichern.'

function badPhoto(message) {
  const err = new Error(message)
  err.status = 400
  return err
}

// Wirft einen 400-Fehler (err.status), wenn das gespeicherte Foto nicht veröffentlicht werden darf.
function assertPublishablePhoto(file) {
  const info = inspectImage(fs.readFileSync(filePathOf(file)))
  if (!info) throw badPhoto(UNREADABLE_MESSAGE)
  if (info.width > MAX_PUBLIC_SIDE || info.height > MAX_PUBLIC_SIDE || info.width * info.height > MAX_PUBLIC_PIXELS) {
    throw badPhoto(TOO_LARGE_MESSAGE)
  }
  if (info.metadata) throw badPhoto(METADATA_MESSAGE)
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
  assertPublishablePhoto,
  removeUploadedFile,
  removeUploadByUrl
}
