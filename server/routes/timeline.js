const express = require('express')
const db = require('../db')
const { requireAuth } = require('../middleware/auth')
const { isIsoDate, cleanText, cleanId, cleanPhotoList } = require('../lib/validate')

const router = express.Router()

const MAX_COMMENT_LENGTH = 1000

function toEntry(row, comments = []) {
  return { ...row, foto_urls: JSON.parse(row.foto_urls), comments }
}

// Kommentare aller gelisteten Einträge in einer Abfrage statt einer pro Eintrag
function commentsByEntry(familyId, dogId) {
  const rows = db
    .prepare(
      `SELECT c.* FROM entry_comments c JOIN timeline_entries t ON t.id = c.entry_id
       WHERE c.family_id = ? AND (? IS NULL OR t.dog_id = ?)
       ORDER BY c.created_at, c.id`
    )
    .all(familyId, dogId, dogId)
  const grouped = new Map()
  for (const row of rows) grouped.set(row.entry_id, [...(grouped.get(row.entry_id) || []), row])
  return grouped
}

const commentsOf = (entryId) => db.prepare('SELECT * FROM entry_comments WHERE entry_id = ? ORDER BY created_at, id').all(entryId)

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

const RECENT_DEFAULT = 6
const RECENT_MAX = 20

// "Was treiben die anderen?": zuletzt geschriebene Einträge aller Hunde des Rudels
router.get('/recent', requireAuth, (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || RECENT_DEFAULT, 1), RECENT_MAX)
  const rows = db
    .prepare(
      `SELECT t.*, d.name AS dog_name, d.name_unbekannt AS dog_name_unbekannt, d.rasse AS dog_rasse,
              d.foto_url AS dog_foto_url,
              (SELECT COUNT(*) FROM entry_comments c WHERE c.entry_id = t.id) AS comment_count
       FROM timeline_entries t JOIN dogs d ON d.id = t.dog_id
       WHERE t.family_id = ?
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT ?`
    )
    .all(req.familyId, limit)
  res.json(rows.map((row) => toEntry(row)))
})

// Chronologisch aufsteigend: die Timeline erzählt das Leben von der Geburt an.
router.get('/', requireAuth, (req, res) => {
  const dogId = cleanId(req.query.dogId)
  if (Number.isNaN(dogId)) return res.status(400).json({ error: 'dogId ist ungültig' })

  const rows = dogId
    ? db
        .prepare('SELECT * FROM timeline_entries WHERE family_id = ? AND dog_id = ? ORDER BY datum, id')
        .all(req.familyId, dogId)
    : db.prepare('SELECT * FROM timeline_entries WHERE family_id = ? ORDER BY datum, id').all(req.familyId)
  const comments = commentsByEntry(req.familyId, dogId)
  res.json(rows.map((row) => toEntry(row, comments.get(row.id))))
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
  res.json(toEntry(entry, commentsOf(entry.id)))
})

const deleteEntry = db.transaction((entryId) => {
  db.prepare('DELETE FROM entry_comments WHERE entry_id = ?').run(entryId)
  db.prepare('DELETE FROM timeline_entries WHERE id = ?').run(entryId)
})

router.delete('/:id', requireAuth, (req, res) => {
  const existing = loadOwnEntry(req, res)
  if (!existing) return
  deleteEntry(existing.id)
  res.status(204).end()
})

// Andere Mitglieder kommentieren einen Eintrag – mit Namen, wie auf der Pinnwand
router.post('/:id/comments', requireAuth, (req, res) => {
  const entry = loadOwnEntry(req, res)
  if (!entry) return

  const body = req.body || {}
  const autorName = cleanText(body.autorName, 60)
  const text = cleanText(body.text, MAX_COMMENT_LENGTH)
  if (!autorName || !text) return res.status(400).json({ error: 'Name und Kommentar sind erforderlich' })

  const result = db
    .prepare('INSERT INTO entry_comments (entry_id, family_id, autor_name, text) VALUES (?, ?, ?, ?)')
    .run(entry.id, req.familyId, autorName, text)
  res.status(201).json(db.prepare('SELECT * FROM entry_comments WHERE id = ?').get(result.lastInsertRowid))
})

router.delete('/:id/comments/:commentId', requireAuth, (req, res) => {
  const comment = db
    .prepare('SELECT * FROM entry_comments WHERE id = ? AND entry_id = ?')
    .get(req.params.commentId, req.params.id)
  if (!comment || comment.family_id !== req.familyId) {
    return res.status(404).json({ error: 'Kommentar nicht gefunden' })
  }
  db.prepare('DELETE FROM entry_comments WHERE id = ?').run(comment.id)
  res.status(204).end()
})

module.exports = router
