const express = require('express')
const db = require('../db')
const { requireAuth } = require('../middleware/auth')
const { isIsoDate, cleanText } = require('../lib/validate')
const { requireRole, FORBIDDEN_MESSAGE } = require('../lib/roles')
const { authorContext, withAuthorFlags, mayDeleteInArea } = require('../lib/authorship')

const router = express.Router()

// Phase R Task 1 (lib/roles.js): einen Zettel anhängen oder abnehmen braucht in einer Familie mindestens
// 'mitglied'. Auf einen Zettel antworten ist wie ein Kommentar - das darf schon ein 'gast'. Eine Antwort
// löschen (Phase R Task 2, lib/authorship.js): in einer Familie die Autorin selbst oder ab Stellvertretung.
const canWrite = requireRole('mitglied')
const canReply = requireRole('gast')

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

// Zettel samt Antworten (älteste Antwort zuerst, wie in einem Gespräch). Antworten tragen vonMir/ehemalig
// (lib/authorship.js), author_family_id selbst bleibt innen.
// Phase V2: die Pinnwand gehört nicht zu einem Besuch - ein Gast bekommt eine leere Liste (der Stammbaum lädt sie mit).
router.get('/', requireAuth, (req, res) => {
  if (req.isGuest) return res.json([])
  const notes = db
    .prepare('SELECT * FROM notes WHERE family_id = ? ORDER BY created_at DESC, id DESC')
    .all(req.familyId)
  const ctx = authorContext(req)
  const replies = db
    .prepare('SELECT * FROM note_replies WHERE family_id = ? ORDER BY created_at, id')
    .all(req.familyId)
    .map((reply) => withAuthorFlags(reply, ctx))
  const byNote = new Map(notes.map((note) => [note.id, []]))
  for (const reply of replies) byNote.get(reply.note_id)?.push(reply)
  res.json(notes.map((note) => ({ ...note, replies: byNote.get(note.id) })))
})

router.post('/', requireAuth, canWrite, (req, res) => {
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

router.delete('/:id', requireAuth, canWrite, (req, res) => {
  const note = loadOwnNote(req, res)
  if (!note) return
  deleteNote(note.id)
  res.status(204).end()
})

router.post('/:id/replies', requireAuth, canReply, (req, res) => {
  const note = loadOwnNote(req, res)
  if (!note) return

  const body = req.body || {}
  const autorName = cleanText(body.autorName, 60)
  const text = cleanText(body.text, MAX_REPLY_LENGTH)
  if (!autorName || !text) return res.status(400).json({ error: 'Name und Antwort sind erforderlich' })

  // author_family_id (Phase R Task 2): die schreibende Identität, nicht der Bereich (lib/authorship.js)
  const result = db
    .prepare('INSERT INTO note_replies (note_id, family_id, author_family_id, autor_name, text) VALUES (?, ?, ?, ?, ?)')
    .run(note.id, req.familyId, req.homeId, autorName, text)
  const reply = db.prepare('SELECT * FROM note_replies WHERE id = ?').get(result.lastInsertRowid)
  res.status(201).json(withAuthorFlags(reply, authorContext(req)))
})

// Löschen: im eigenen Bereich wie bisher jede Antwort des Bereichs; in einer Familie nur die eigene oder
// ab Stellvertretung (Moderation, lib/authorship.js mayDeleteInArea) - sonst 403.
router.delete('/:id/replies/:replyId', requireAuth, canReply, (req, res) => {
  const reply = db.prepare('SELECT * FROM note_replies WHERE id = ? AND note_id = ?').get(req.params.replyId, req.params.id)
  if (!reply || reply.family_id !== req.familyId) {
    return res.status(404).json({ error: 'Antwort nicht gefunden' })
  }
  if (!mayDeleteInArea(reply, authorContext(req))) return res.status(403).json({ error: FORBIDDEN_MESSAGE })
  db.prepare('DELETE FROM note_replies WHERE id = ?').run(reply.id)
  res.status(204).end()
})

module.exports = router
