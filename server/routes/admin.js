const fs = require('node:fs')
const path = require('node:path')
const express = require('express')
const rateLimit = require('express-rate-limit')
const db = require('../db')
const config = require('../config')
const { verifyPassword, safeEqual } = require('../lib/adminAuth')
const { requireAdmin, setAdminCookie, clearAdminCookie } = require('../middleware/admin')

const router = express.Router()

const ADMIN_LOGIN_LIMIT = 10
const RECENT_ENTRIES = 50

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: ADMIN_LOGIN_LIMIT,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Zu viele Versuche. Bitte warte ein paar Minuten.' }
})

// Ohne hinterlegten Passwort-Hash gibt es keinen Admin-Zugang
router.use((req, res, next) => {
  if (!config.adminPasswordHash) return res.status(404).json({ error: 'Nicht gefunden' })
  next()
})

router.post('/login', adminLoginLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body || {}
    const userOk = safeEqual(username, config.adminUsername)
    const passwordOk = await verifyPassword(password, config.adminPasswordHash)
    if (!userOk || !passwordOk) return res.status(401).json({ error: 'Benutzername oder Passwort falsch' })
    setAdminCookie(res)
    res.json({ username: config.adminUsername })
  } catch (err) {
    next(err)
  }
})

router.post('/logout', (req, res) => {
  clearAdminCookie(res)
  res.status(204).end()
})

router.get('/me', requireAdmin, (req, res) => {
  res.json({ username: config.adminUsername })
})

function uploadStats() {
  if (!fs.existsSync(config.uploadDir)) return { files: 0, bytes: 0 }
  const files = fs.readdirSync(config.uploadDir).filter((name) => name !== '.gitkeep')
  const bytes = files.reduce((sum, name) => sum + fs.statSync(path.join(config.uploadDir, name)).size, 0)
  return { files: files.length, bytes }
}

const count = (table) => db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c

// Nachrichten aus "Schreib dem Admin" – offene zuerst, darin die neuesten oben
router.get('/messages', requireAdmin, (req, res) => {
  const where = []
  const params = []
  if (['feedback', 'problem'].includes(req.query.type)) {
    where.push('m.type = ?')
    params.push(req.query.type)
  }
  if (['offen', 'erledigt'].includes(req.query.status)) {
    where.push('m.status = ?')
    params.push(req.query.status)
  }
  const messages = db
    .prepare(
      `SELECT m.*, f.name AS family_name
       FROM admin_messages m JOIN families f ON f.id = m.family_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY m.status = 'erledigt', m.created_at DESC, m.id DESC`
    )
    .all(...params)
  res.json(messages)
})

router.patch('/messages/:id', requireAdmin, (req, res) => {
  const { status } = req.body || {}
  if (!['offen', 'erledigt'].includes(status)) return res.status(400).json({ error: 'Status muss offen oder erledigt sein' })
  const resolvedAt = status === 'erledigt' ? "datetime('now')" : 'NULL'
  const result = db.prepare(`UPDATE admin_messages SET status = ?, resolved_at = ${resolvedAt} WHERE id = ?`).run(status, req.params.id)
  if (!result.changes) return res.status(404).json({ error: 'Nachricht nicht gefunden' })
  res.json(db.prepare('SELECT * FROM admin_messages WHERE id = ?').get(req.params.id))
})

router.delete('/messages/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM admin_messages WHERE id = ?').run(req.params.id)
  if (!result.changes) return res.status(404).json({ error: 'Nachricht nicht gefunden' })
  res.status(204).end()
})

router.get('/overview', requireAdmin, (req, res) => {
  const families = db
    .prepare(
      `SELECT f.id, f.name, f.created_at,
         (SELECT COUNT(*) FROM dogs d WHERE d.family_id = f.id) AS dogs,
         (SELECT COUNT(*) FROM timeline_entries t WHERE t.family_id = f.id) AS entries,
         (SELECT COUNT(*) FROM notes n WHERE n.family_id = f.id) AS notes,
         (SELECT COUNT(*) FROM note_replies r WHERE r.family_id = f.id) AS replies,
         (SELECT MAX(x) FROM (
            SELECT MAX(created_at) AS x FROM dogs WHERE family_id = f.id
            UNION ALL SELECT MAX(created_at) FROM timeline_entries WHERE family_id = f.id
            UNION ALL SELECT MAX(created_at) FROM notes WHERE family_id = f.id
            UNION ALL SELECT MAX(created_at) FROM note_replies WHERE family_id = f.id
         )) AS last_activity
       FROM families f ORDER BY f.created_at`
    )
    .all()

  res.json({
    stats: {
      families: count('families'),
      dogs: count('dogs'),
      entries: count('timeline_entries'),
      notes: count('notes'),
      replies: count('note_replies'),
      breeding: count('breeding_events'),
      openMessages: db.prepare("SELECT COUNT(*) AS c FROM admin_messages WHERE status = 'offen'").get().c,
      uploads: uploadStats()
    },
    inviteCode: config.inviteCode || null,
    families
  })
})

router.get('/families/:id', requireAdmin, (req, res) => {
  const family = db.prepare('SELECT id, name, created_at FROM families WHERE id = ?').get(req.params.id)
  if (!family) return res.status(404).json({ error: 'Rudel nicht gefunden' })

  const dogs = db
    .prepare(
      `SELECT d.id, d.name, d.name_unbekannt, d.rasse, d.tierart, d.geschlecht, d.geburtsdatum, d.foto_url, d.created_at,
              d.mother_freitext, d.father_freitext,
              m.name AS mother_name, m.name_unbekannt AS mother_unbekannt, m.rasse AS mother_rasse,
              v.name AS father_name, v.name_unbekannt AS father_unbekannt, v.rasse AS father_rasse,
              (SELECT COUNT(*) FROM timeline_entries t WHERE t.dog_id = d.id) AS entries
       FROM dogs d
       LEFT JOIN dogs m ON m.id = d.mother_dog_id
       LEFT JOIN dogs v ON v.id = d.father_dog_id
       WHERE d.family_id = ?
       ORDER BY d.geburtsdatum IS NULL, d.geburtsdatum, d.name`
    )
    .all(family.id)

  const entries = db
    .prepare(
      `SELECT t.id, t.datum, t.titel, t.text, t.autor_name, t.foto_urls, t.created_at,
              d.name AS dog_name, d.name_unbekannt AS dog_unbekannt, d.rasse AS dog_rasse
       FROM timeline_entries t JOIN dogs d ON d.id = t.dog_id
       WHERE t.family_id = ? ORDER BY t.created_at DESC, t.id DESC LIMIT ?`
    )
    .all(family.id, RECENT_ENTRIES)
    .map((entry) => ({ ...entry, foto_urls: JSON.parse(entry.foto_urls) }))

  const notes = db.prepare('SELECT * FROM notes WHERE family_id = ? ORDER BY created_at DESC, id DESC').all(family.id)
  const replies = db.prepare('SELECT * FROM note_replies WHERE family_id = ? ORDER BY created_at, id').all(family.id)
  const byNote = new Map(notes.map((note) => [note.id, []]))
  for (const reply of replies) byNote.get(reply.note_id)?.push(reply)

  res.json({ family, dogs, entries, notes: notes.map((note) => ({ ...note, replies: byNote.get(note.id) })) })
})

module.exports = router
