const express = require('express')
const rateLimit = require('express-rate-limit')
const db = require('../db')
const { requireAuth } = require('../middleware/auth')
const { cleanText } = require('../lib/validate')

// "Schreib dem Admin": Feedback und Problemmeldungen aus den Rudeln
const router = express.Router()

const TYPES = ['feedback', 'problem']
const MESSAGES_PER_HOUR = 20

const messageLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: MESSAGES_PER_HOUR,
  keyGenerator: (req) => `family-${req.familyId}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Sehr viele Nachrichten in kurzer Zeit – bitte später noch einmal versuchen.' }
})

const PUBLIC_COLUMNS = 'id, type, autor_name, text, status, created_at, resolved_at'

router.get('/', requireAuth, (req, res) => {
  const messages = db
    .prepare(`SELECT ${PUBLIC_COLUMNS} FROM admin_messages WHERE family_id = ? ORDER BY created_at DESC, id DESC`)
    .all(req.familyId)
  res.json(messages)
})

router.post('/', requireAuth, messageLimiter, (req, res) => {
  const body = req.body || {}
  const values = {
    family_id: req.familyId,
    type: body.type,
    autor_name: cleanText(body.autorName, 60),
    contact: cleanText(body.contact, 120),
    text: cleanText(body.text, 4000),
    page: cleanText(body.page, 200),
    user_agent: cleanText(req.get('user-agent'), 300)
  }
  if (!TYPES.includes(values.type)) return res.status(400).json({ error: 'Bitte „Feedback“ oder „Problem melden“ wählen' })
  if (!values.autor_name || !values.text) return res.status(400).json({ error: 'Name und Nachricht sind erforderlich' })

  const result = db
    .prepare(
      `INSERT INTO admin_messages (family_id, type, autor_name, contact, text, page, user_agent)
       VALUES (@family_id, @type, @autor_name, @contact, @text, @page, @user_agent)`
    )
    .run(values)
  res.status(201).json(db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM admin_messages WHERE id = ?`).get(result.lastInsertRowid))
})

module.exports = router
