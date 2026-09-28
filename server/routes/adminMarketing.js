const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const express = require('express')
const multer = require('multer')
const db = require('../db')
const config = require('../config')
const { requireAdmin } = require('../middleware/admin')
const { cleanId } = require('../lib/validate')
const { detectImageExt, LOGO_MIME_TYPES, MAX_LOGO_BYTES } = require('../lib/partners')
const { stripJpegMetadata } = require('../lib/stripJpegMetadata')
const { stripPngMetadata } = require('../lib/stripPngMetadata')
const { validatePromotion, cleanTextInput, cleanOptionalText, validateUrl } = require('../lib/promotions')

// Phase 3 Task 1: Admin-Pflege für den Reiter "Entdecken" - Empfehlungen/Anzeigen (promotions),
// GoFundMe-Link/Text (settings) und Transparenzberichte (donation_reports). Eingehängt unter /api/admin
// in app.js, GENAU wie routes/admin.js: derselbe 404-ohne-Passwort-Hash-Gate direkt danach und
// requireAdmin auf jeder einzelnen Route (siehe routes/admin.js für das Vorbild).
const router = express.Router()

// Ohne hinterlegten Passwort-Hash gibt es keinen Admin-Zugang - wie routes/admin.js.
router.use((req, res, next) => {
  if (!config.adminPasswordHash) return res.status(404).json({ error: 'Nicht gefunden' })
  next()
})

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// --- Empfehlungen/Anzeigen (promotions) ----------------------------------------------------------

function findPromotion(id) {
  return id ? db.prepare('SELECT * FROM promotions WHERE id = ?').get(id) : null
}

// bildUrl zusätzlich zu den Spalten - wie logoUrl bei Partnern (lib/partners.js publicPartner).
function promotionRow(row) {
  if (!row) return row
  return { ...row, bildUrl: row.bild_file ? `/partner-media/${row.bild_file}` : null }
}

router.get('/promotions', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM promotions ORDER BY created_at DESC, id DESC').all()
  res.json(rows.map(promotionRow))
})

router.post('/promotions', requireAdmin, (req, res, next) => {
  try {
    const clean = validatePromotion(req.body || {}, { db })
    const columns = Object.keys(clean)
    const id = db
      .prepare(`INSERT INTO promotions (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
      .run(...columns.map((col) => clean[col])).lastInsertRowid
    res.status(201).json(promotionRow(findPromotion(id)))
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

router.put('/promotions/:id', requireAdmin, (req, res, next) => {
  try {
    const id = cleanId(req.params.id)
    const existing = findPromotion(id)
    if (!existing) return res.status(404).json({ error: 'Diese Empfehlung gibt es nicht' })

    const clean = validatePromotion(req.body || {}, { db })
    const columns = Object.keys(clean)
    db.prepare(`UPDATE promotions SET ${columns.map((col) => `${col} = ?`).join(', ')} WHERE id = ?`).run(
      ...columns.map((col) => clean[col]),
      id
    )
    res.json(promotionRow(findPromotion(id)))
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

router.delete('/promotions/:id', requireAdmin, (req, res) => {
  const id = cleanId(req.params.id)
  const existing = findPromotion(id)
  if (!existing) return res.status(404).json({ error: 'Diese Empfehlung gibt es nicht' })
  if (existing.bild_file) fs.rmSync(path.join(config.partnerMediaDir, existing.bild_file), { force: true })
  db.prepare('DELETE FROM promotions WHERE id = ?').run(id)
  res.status(204).end()
})

// Bild: wie das Partner-Logo (routes/admin.js POST /partners/:id/logo) - server-vergebener Dateiname,
// Magic-Byte-Prüfung statt Content-Type, Ablage im öffentlichen partner-media-Ordner. Zusätzlich
// (security-review Phase T Finding 12): EXIF-/PNG-Metadaten raus, bevor die Datei geschrieben wird -
// anders als beim Partner-Logo, weil hochgeladene Anzeigen-/Empfehlungsbilder ebenso von einem Handy
// stammen können wie Tierfotos.
const promotionImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO_BYTES, files: 1, fields: 0, parts: 2 }
})

function stripImageMetadata(buffer, mimetype) {
  if (mimetype === 'image/jpeg') return stripJpegMetadata(buffer)
  if (mimetype === 'image/png') return stripPngMetadata(buffer)
  return buffer
}

router.post('/promotions/:id/image', requireAdmin, (req, res, next) => {
  const id = cleanId(req.params.id)
  const promotion = findPromotion(id)
  if (!promotion) return res.status(404).json({ error: 'Diese Empfehlung gibt es nicht' })

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

    const stripped = stripImageMetadata(req.file.buffer, req.file.mimetype)

    fs.mkdirSync(config.partnerMediaDir, { recursive: true })
    const filename = `${crypto.randomUUID()}.${ext}`
    fs.writeFileSync(path.join(config.partnerMediaDir, filename), stripped)

    if (promotion.bild_file) {
      fs.rmSync(path.join(config.partnerMediaDir, promotion.bild_file), { force: true })
    }
    db.prepare('UPDATE promotions SET bild_file = ? WHERE id = ?').run(filename, id)
    res.status(201).json({ bildUrl: `/partner-media/${filename}` })
  })
})

// --- Einstellungen (settings) ---------------------------------------------------------------------
// Erlaubte Schlüssel: echte Werte (gofundme_url/unterstuetzen_text) und ihre Demo-Pendants (Task 3) -
// eigene Schlüssel, damit ein Demo-Pack-Aufbau die echten Werte nie überschreibt (siehe Plan Task 3).

const SETTINGS_URL_KEYS = ['gofundme_url', 'demo_gofundme_url']
const SETTINGS_TEXT_KEYS = ['unterstuetzen_text', 'demo_unterstuetzen_text']
const SETTINGS_KEYS = [...SETTINGS_URL_KEYS, ...SETTINGS_TEXT_KEYS]
const MAX_SETTINGS_TEXT_LENGTH = 600

function validateSettingValue(key, value) {
  if (SETTINGS_URL_KEYS.includes(key)) {
    if (value === '' || value === null || value === undefined) return ''
    return validateUrl(value, key) || ''
  }
  return cleanOptionalText(value, MAX_SETTINGS_TEXT_LENGTH, key) || ''
}

function readSettings() {
  const rows = db
    .prepare(`SELECT key, value FROM settings WHERE key IN (${SETTINGS_KEYS.map(() => '?').join(', ')})`)
    .all(...SETTINGS_KEYS)
  const byKey = new Map(rows.map((row) => [row.key, row.value]))
  const result = {}
  for (const key of SETTINGS_KEYS) result[key] = byKey.get(key) ?? ''
  return result
}

router.get('/settings', requireAdmin, (req, res) => {
  res.json(readSettings())
})

router.put('/settings', requireAdmin, (req, res, next) => {
  try {
    const body = req.body || {}
    const unknownKeys = Object.keys(body).filter((key) => !SETTINGS_KEYS.includes(key))
    if (unknownKeys.length) throw httpError(400, `Unbekannte Einstellung: ${unknownKeys.join(', ')}`)

    const updates = Object.keys(body).map((key) => [key, validateSettingValue(key, body[key])])
    const upsert = db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    db.transaction(() => {
      for (const [key, value] of updates) upsert.run(key, value)
    })()

    res.json(readSettings())
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

// --- Spendenberichte (donation_reports) -----------------------------------------------------------

const MAX_ZEITRAUM_LENGTH = 40
const MAX_EMPFAENGER_LENGTH = 120
const MAX_CENTS = 1e9

function cleanCents(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > MAX_CENTS) {
    throw httpError(400, `${label} muss eine ganze Zahl zwischen 0 und ${MAX_CENTS} sein (Cent)`)
  }
  return value
}

function validateDonationReport(input = {}) {
  const zeitraum = cleanTextInput(input.zeitraum)
  if (!zeitraum) throw httpError(400, 'Der Zeitraum ist Pflicht')
  if (zeitraum.length > MAX_ZEITRAUM_LENGTH) throw httpError(400, `Der Zeitraum darf höchstens ${MAX_ZEITRAUM_LENGTH} Zeichen haben`)

  const eingangCents = cleanCents(input.eingangCents, 'Der Eingang')
  const kostenCents = cleanCents(input.kostenCents, 'Die Kosten')
  const weitergeleitetCents = cleanCents(input.weitergeleitetCents, 'Der weitergeleitete Betrag')
  const empfaenger = cleanOptionalText(input.empfaenger, MAX_EMPFAENGER_LENGTH, 'Der Empfänger')
  const nachweisUrl = validateUrl(input.nachweisUrl, 'Der Nachweis-Link')

  return {
    zeitraum,
    eingang_cents: eingangCents,
    kosten_cents: kostenCents,
    weitergeleitet_cents: weitergeleitetCents,
    empfaenger,
    nachweis_url: nachweisUrl
  }
}

function findDonationReport(id) {
  return id ? db.prepare('SELECT * FROM donation_reports WHERE id = ?').get(id) : null
}

router.get('/donation-reports', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM donation_reports ORDER BY created_at DESC, id DESC').all())
})

router.post('/donation-reports', requireAdmin, (req, res, next) => {
  try {
    const clean = validateDonationReport(req.body || {})
    const columns = Object.keys(clean)
    const id = db
      .prepare(`INSERT INTO donation_reports (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
      .run(...columns.map((col) => clean[col])).lastInsertRowid
    res.status(201).json(findDonationReport(id))
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

router.put('/donation-reports/:id', requireAdmin, (req, res, next) => {
  try {
    const id = cleanId(req.params.id)
    const existing = findDonationReport(id)
    if (!existing) return res.status(404).json({ error: 'Diesen Spendenbericht gibt es nicht' })

    const clean = validateDonationReport(req.body || {})
    const columns = Object.keys(clean)
    db.prepare(`UPDATE donation_reports SET ${columns.map((col) => `${col} = ?`).join(', ')} WHERE id = ?`).run(
      ...columns.map((col) => clean[col]),
      id
    )
    res.json(findDonationReport(id))
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

router.delete('/donation-reports/:id', requireAdmin, (req, res) => {
  const id = cleanId(req.params.id)
  const existing = findDonationReport(id)
  if (!existing) return res.status(404).json({ error: 'Diesen Spendenbericht gibt es nicht' })
  db.prepare('DELETE FROM donation_reports WHERE id = ?').run(id)
  res.status(204).end()
})

module.exports = router
