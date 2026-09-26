const express = require('express')
const db = require('../db')
const { requireAuth } = require('../middleware/auth')
const { isIsoDate, cleanText, cleanId, cleanPhotoList } = require('../lib/validate')

const router = express.Router()

function toEntry(row) {
  return { ...row, foto_urls: JSON.parse(row.foto_urls) }
}

// Validiert Titel/Datum/Autor/Text/Fotos. Liefert { error } oder { values }.
function readEntryInput(body) {
  const values = {
    autor_name: cleanText(body.autorName, 60),
    datum: body.datum,
    titel: cleanText(body.titel, 120),
    text: cleanText(body.text, 5000),
    foto_urls: cleanPhotoList(body.fotoUrls)
  }
  if (!values.autor_name || !values.titel || !values.datum) {
    return { error: 'Name, Datum und Titel sind erforderlich' }
  }
  if (!isIsoDate(values.datum)) return { error: 'Datum ist ungültig' }
  if (values.foto_urls === null) return { error: 'Fotoliste ist ungültig' }
  return { values: { ...values, foto_urls: JSON.stringify(values.foto_urls) } }
}

function loadOwnEntry(req, res) {
  const entry = db.prepare('SELECT * FROM timeline_entries WHERE id = ?').get(req.params.id)
  if (!entry || entry.family_id !== req.familyId) {
    res.status(404).json({ error: 'Eintrag nicht gefunden' })
    return null
  }
  return entry
}

// Chronologisch aufsteigend: die Timeline erzählt das Leben von der Geburt an.
router.get('/', requireAuth, (req, res) => {
  const dogId = cleanId(req.query.dogId)
  if (Number.isNaN(dogId)) return res.status(400).json({ error: 'dogId ist ungültig' })

  const rows = dogId
    ? db
        .prepare('SELECT * FROM timeline_entries WHERE family_id = ? AND dog_id = ? ORDER BY datum, id')
        .all(req.familyId, dogId)
    : db.prepare('SELECT * FROM timeline_entries WHERE family_id = ? ORDER BY datum, id').all(req.familyId)
  res.json(rows.map(toEntry))
})

router.post('/', requireAuth, (req, res) => {
  const body = req.body || {}
  const dogId = cleanId(body.dogId)
  if (!dogId) return res.status(400).json({ error: 'dogId ist erforderlich' })

  const { error, values } = readEntryInput(body)
  if (error) return res.status(400).json({ error })

  const dog = db.prepare('SELECT id, family_id FROM dogs WHERE id = ?').get(dogId)
  if (!dog || dog.family_id !== req.familyId) {
    return res.status(403).json({ error: 'Kein Zugriff auf diesen Hund' })
  }

  const result = db
    .prepare(
      `INSERT INTO timeline_entries (dog_id, family_id, autor_name, datum, titel, text, foto_urls)
       VALUES (@dog_id, @family_id, @autor_name, @datum, @titel, @text, @foto_urls)`
    )
    .run({ ...values, dog_id: dogId, family_id: req.familyId })

  const entry = db.prepare('SELECT * FROM timeline_entries WHERE id = ?').get(result.lastInsertRowid)
  res.status(201).json(toEntry(entry))
})

router.put('/:id', requireAuth, (req, res) => {
  const existing = loadOwnEntry(req, res)
  if (!existing) return

  const { error, values } = readEntryInput(req.body || {})
  if (error) return res.status(400).json({ error })

  db.prepare(
    `UPDATE timeline_entries
     SET autor_name = @autor_name, datum = @datum, titel = @titel, text = @text, foto_urls = @foto_urls
     WHERE id = @id`
  ).run({ ...values, id: existing.id })

  const entry = db.prepare('SELECT * FROM timeline_entries WHERE id = ?').get(existing.id)
  res.json(toEntry(entry))
})

router.delete('/:id', requireAuth, (req, res) => {
  const existing = loadOwnEntry(req, res)
  if (!existing) return
  db.prepare('DELETE FROM timeline_entries WHERE id = ?').run(existing.id)
  res.status(204).end()
})

module.exports = router
