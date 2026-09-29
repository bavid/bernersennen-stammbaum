const express = require('express')
const db = require('../db')
const config = require('../config')
const { requireAdmin } = require('../middleware/admin')
const { cleanId } = require('../lib/validate')
const {
  validatePromotion,
  validateAblehnungsgrund,
  validateFreigabeFilter,
  validateDonationReport,
  cleanOptionalText,
  validateUrl,
  promotionClicksJoinSql,
  promotionImageUrl,
  PROMOTION_CLICKS_COLUMNS_SQL,
  FREIGABE
} = require('../lib/promotions')
const { handlePromotionImageUpload, removePromotionImage } = require('../lib/promotionImage')
const { asPartnerPostInput } = require('../lib/partnerPosts')

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

const NOT_FOUND = 'Diese Empfehlung gibt es nicht'

// partnerName (Phase P2 Task 8): Name des verknüpften Partners, null ohne Partner.
const findPromotionStmt = db.prepare(
  `SELECT p.*, pa.name AS partnerName FROM promotions p LEFT JOIN partners pa ON pa.id = p.partner_id WHERE p.id = ?`
)

function findPromotion(id) {
  return id ? findPromotionStmt.get(id) : null
}

// bildUrl zusätzlich zu den Spalten - wie logoUrl bei Partnern (lib/partners.js publicPartner) - und
// erstelltVonPartner (Phase P2 Task 8: Beitrag eines Partners aus seinem Bereich).
function promotionRow(row) {
  if (!row) return row
  return { ...row, bildUrl: promotionImageUrl(row.bild_file), erstelltVonPartner: Boolean(row.erstellt_von_partner) }
}

// Klickzahlen je Empfehlung in EINER aggregierten Abfrage (lib/promotions.js promotionClicksJoinSql), dazu
// der Partner-Name. @freigabe NULL = alle, sonst nur diese Freigabe (?freigabe=eingereicht zum Prüfen).
const listPromotionsWithClicks = db.prepare(
  `SELECT p.*, pa.name AS partnerName, ${PROMOTION_CLICKS_COLUMNS_SQL}
   FROM promotions p
   LEFT JOIN partners pa ON pa.id = p.partner_id
   ${promotionClicksJoinSql('p')}
   WHERE (@freigabe IS NULL OR p.freigabe = @freigabe)
   ORDER BY p.created_at DESC, p.id DESC`
)

router.get('/promotions', requireAdmin, (req, res, next) => {
  try {
    const freigabe = validateFreigabeFilter(req.query.freigabe)
    res.json(listPromotionsWithClicks.all({ freigabe }).map(promotionRow))
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

// Was der Admin anlegt oder ändert, ist sofort freigegeben (Phase P2 Task 8) - auch ein Beitrag eines
// Partners. Der bleibt dabei "Anzeige" ohne "Empfehlung von" und beim selben Partner (asPartnerPostInput):
// eine bezahlte Anzeige darf nie als Empfehlung erscheinen (Roadmap-Entscheidung 9, lib/promotions.js).
function validateAdminPromotion(body, existing) {
  const approved = { freigabe: FREIGABE.freigegeben, ablehnungsgrund: null }
  if (!existing?.erstellt_von_partner) return { ...validatePromotion(body, { db }), ...approved }
  return { ...validatePromotion(asPartnerPostInput(body), { db }), partner_id: existing.partner_id, ...approved }
}

router.post('/promotions', requireAdmin, (req, res, next) => {
  try {
    const clean = validateAdminPromotion(req.body || {}, null)
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
    if (!existing) return res.status(404).json({ error: NOT_FOUND })

    const clean = validateAdminPromotion(req.body || {}, existing)
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
  if (!existing) return res.status(404).json({ error: NOT_FOUND })
  removePromotionImage(existing.bild_file)
  db.prepare('DELETE FROM promotions WHERE id = ?').run(id)
  res.status(204).end()
})

// Phase P2 Task 8: Freigabe der Beiträge (und jeder anderen Empfehlung). Freigeben räumt einen früheren
// Ablehnungsgrund weg; Ablehnen braucht einen Grund (lib/promotions.js validateAblehnungsgrund), den der
// Partner in seiner Beitragsliste sieht.
const setFreigabe = db.prepare('UPDATE promotions SET freigabe = ?, ablehnungsgrund = ? WHERE id = ?')

router.post('/promotions/:id/freigeben', requireAdmin, (req, res) => {
  const id = cleanId(req.params.id)
  if (!findPromotion(id)) return res.status(404).json({ error: NOT_FOUND })
  setFreigabe.run(FREIGABE.freigegeben, null, id)
  res.json(promotionRow(findPromotion(id)))
})

router.post('/promotions/:id/ablehnen', requireAdmin, (req, res, next) => {
  try {
    const id = cleanId(req.params.id)
    if (!findPromotion(id)) return res.status(404).json({ error: NOT_FOUND })
    const grund = validateAblehnungsgrund(req.body?.grund)
    setFreigabe.run(FREIGABE.abgelehnt, grund, id)
    res.json(promotionRow(findPromotion(id)))
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

// Bild: gemeinsame Upload-Strecke mit den Beiträgen der Partner (lib/promotionImage.js). Ein Bild vom Admin
// ändert die Freigabe nicht.
router.post('/promotions/:id/image', requireAdmin, (req, res, next) => {
  const id = cleanId(req.params.id)
  if (!findPromotion(id)) return res.status(404).json({ error: NOT_FOUND })
  handlePromotionImageUpload(req, res, next, id)
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
// Validierung: validateDonationReport aus lib/promotions.js (auch vom Demo-Bericht in lib/demoPack.js genutzt).

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
