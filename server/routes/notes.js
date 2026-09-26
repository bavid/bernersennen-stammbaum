const express = require('express')
const db = require('../db')
const { requireAuth } = require('../middleware/auth')
const { isIsoDate, cleanText } = require('../lib/validate')

const router = express.Router()

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const MAX_REPLY_LENGTH = 1000

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

function loadOwnNote(req, res) {
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id)
  if (!note || note.family_id !== req.familyId) {
    res.status(404).json({ error: 'Zettel nicht gefunden' })
    return null
  }
  return note
}

// Zettel samt Antworten (älteste Antwort zuerst, wie in einem Gespräch)
router.get('/', requireAuth, (req, res) => {
  const notes = db
    .prepare('SELECT * FROM notes WHERE family_id = ? ORDER BY created_at DESC, id DESC')
    .all(req.familyId)
  const replies = db
    .prepare('SELECT * FROM note_replies WHERE family_id = ? ORDER BY created_at, id')
    .all(req.familyId)
  const byNote = new Map(notes.map((note) => [note.id, []]))
  for (const reply of replies) byNote.get(reply.note_id)?.push(reply)
  res.json(notes.map((note) => ({ ...note, replies: byNote.get(note.id) })))
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
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid)
  res.status(201).json({ ...note, replies: [] })
})

const deleteNote = db.transaction((noteId) => {
  db.prepare('DELETE FROM note_replies WHERE note_id = ?').run(noteId)
  db.prepare('DELETE FROM notes WHERE id = ?').run(noteId)
})

router.delete('/:id', requireAuth, (req, res) => {
  const note = loadOwnNote(req, res)
  if (!note) return
  deleteNote(note.id)
  res.status(204).end()
})

router.post('/:id/replies', requireAuth, (req, res) => {
  const note = loadOwnNote(req, res)
  if (!note) return

  const body = req.body || {}
  const autorName = cleanText(body.autorName, 60)
  const text = cleanText(body.text, MAX_REPLY_LENGTH)
  if (!autorName || !text) return res.status(400).json({ error: 'Name und Antwort sind erforderlich' })

  const result = db
    .prepare('INSERT INTO note_replies (note_id, family_id, autor_name, text) VALUES (?, ?, ?, ?)')
    .run(note.id, req.familyId, autorName, text)
  res.status(201).json(db.prepare('SELECT * FROM note_replies WHERE id = ?').get(result.lastInsertRowid))
})

router.delete('/:id/replies/:replyId', requireAuth, (req, res) => {
  const reply = db.prepare('SELECT * FROM note_replies WHERE id = ? AND note_id = ?').get(req.params.replyId, req.params.id)
  if (!reply || reply.family_id !== req.familyId) {
    return res.status(404).json({ error: 'Antwort nicht gefunden' })
  }
  db.prepare('DELETE FROM note_replies WHERE id = ?').run(reply.id)
  res.status(204).end()
})

module.exports = router
