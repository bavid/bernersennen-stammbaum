const express = require('express')
const db = require('../db')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

router.get('/', requireAuth, (req, res) => {
  const { dogId } = req.query
  let rows
  if (dogId) {
    rows = db
      .prepare('SELECT * FROM timeline_entries WHERE family_id = ? AND dog_id = ? ORDER BY datum DESC')
      .all(req.familyId, dogId)
  } else {
    rows = db
      .prepare('SELECT * FROM timeline_entries WHERE family_id = ? ORDER BY datum DESC')
      .all(req.familyId)
  }
  res.json(rows.map((r) => ({ ...r, foto_urls: JSON.parse(r.foto_urls) })))
})

router.post('/', requireAuth, (req, res) => {
  const body = req.body || {}
  if (!body.dogId || !body.autorName?.trim() || !body.datum || !body.titel?.trim()) {
    return res.status(400).json({ error: 'dogId, autorName, datum und titel sind erforderlich' })
  }

  const dog = db.prepare('SELECT id, family_id FROM dogs WHERE id = ?').get(body.dogId)
  if (!dog || dog.family_id !== req.familyId) {
    return res.status(403).json({ error: 'Kein Zugriff auf diesen Hund' })
  }

  const result = db
    .prepare(
      `INSERT INTO timeline_entries (dog_id, family_id, autor_name, datum, titel, text, foto_urls)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      body.dogId,
      req.familyId,
      body.autorName.trim(),
      body.datum,
      body.titel.trim(),
      body.text || null,
      JSON.stringify(body.fotoUrls || [])
    )

  const entry = db.prepare('SELECT * FROM timeline_entries WHERE id = ?').get(result.lastInsertRowid)
  res.status(201).json({ ...entry, foto_urls: JSON.parse(entry.foto_urls) })
})

module.exports = router
