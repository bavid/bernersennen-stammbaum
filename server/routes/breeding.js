const express = require('express')
const db = require('../db')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

router.get('/', requireAuth, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM breeding_events WHERE family_id = ? ORDER BY datum DESC')
    .all(req.familyId)
  res.json(rows.map((r) => ({ ...r, foto_urls: JSON.parse(r.foto_urls) })))
})

router.post('/', requireAuth, (req, res) => {
  const body = req.body || {}
  if (!body.mutterDogId || !body.datum) {
    return res.status(400).json({ error: 'mutterDogId und datum sind erforderlich' })
  }
  if (body.vaterDogId && body.vaterFreitext?.trim()) {
    return res.status(400).json({ error: 'vaterDogId und vaterFreitext dürfen nicht gleichzeitig gesetzt sein' })
  }

  const mutter = db.prepare('SELECT id, family_id FROM dogs WHERE id = ?').get(body.mutterDogId)
  if (!mutter || mutter.family_id !== req.familyId) {
    return res.status(403).json({ error: 'Mutter muss ein Hund der eigenen Familie sein' })
  }

  const result = db
    .prepare(
      `INSERT INTO breeding_events
        (family_id, mutter_dog_id, vater_dog_id, vater_freitext, datum, wurf_info, foto_urls)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.familyId,
      body.mutterDogId,
      body.vaterDogId || null,
      body.vaterFreitext || null,
      body.datum,
      body.wurfInfo || null,
      JSON.stringify(body.fotoUrls || [])
    )

  const entry = db.prepare('SELECT * FROM breeding_events WHERE id = ?').get(result.lastInsertRowid)
  res.status(201).json({ ...entry, foto_urls: JSON.parse(entry.foto_urls) })
})

module.exports = router
