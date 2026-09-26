const express = require('express')
const db = require('../db')
const { requireAuth } = require('../middleware/auth')
const { isIsoDate, cleanText } = require('../lib/validate')

const router = express.Router()

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

// Pinnwand: einfache Zettel fürs ganze Rudel, optional mit Termin (Datum, Uhrzeit).
function readNoteInput(body) {
  const values = {
    autor_name: cleanText(body.autorName, 60),
    text: cleanText(body.text, 2000),
    termin_datum: cleanText(body.terminDatum, 10),
    termin_zeit: cleanText(body.terminZeit, 5)
  }
  if (!values.autor_name || !values.text) return { error: 'Name und Text sind erforderlich' }
  if (values.termin_datum && !isIsoDate(values.termin_datum)) return { error: 'Termin-Datum ist ungültig' }
  if (values.termin_zeit && !values.termin_datum) return { error: 'Uhrzeit nur zusammen mit einem Datum' }
  if (values.termin_zeit && !TIME.test(values.termin_zeit)) return { error: 'Uhrzeit ist ungültig' }
  return { values }
}

router.get('/', requireAuth, (req, res) => {
  const notes = db
    .prepare('SELECT * FROM notes WHERE family_id = ? ORDER BY created_at DESC, id DESC')
    .all(req.familyId)
  res.json(notes)
})

router.post('/', requireAuth, (req, res) => {
  const { error, values } = readNoteInput(req.body || {})
  if (error) return res.status(400).json({ error })

  const result = db
    .prepare(
      `INSERT INTO notes (family_id, autor_name, text, termin_datum, termin_zeit)
       VALUES (@family_id, @autor_name, @text, @termin_datum, @termin_zeit)`
    )
    .run({ ...values, family_id: req.familyId })
  res.status(201).json(db.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid))
})

router.delete('/:id', requireAuth, (req, res) => {
  const note = db.prepare('SELECT family_id FROM notes WHERE id = ?').get(req.params.id)
  if (!note || note.family_id !== req.familyId) {
    return res.status(404).json({ error: 'Zettel nicht gefunden' })
  }
  db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id)
  res.status(204).end()
})

module.exports = router
