const express = require('express')
const rateLimit = require('express-rate-limit')
const db = require('../db')
const { requireAuth } = require('../middleware/auth')
const { cleanText } = require('../lib/validate')

// "Schreib dem Admin": Feedback und Problemmeldungen aus den Rudeln.
// Nur der Admin liest sie – das Rudel teilt sich ein Login, deshalb gibt es bewusst
// keinen Endpunkt zum Zurücklesen. Der Name ist freiwillig (leer = anonym).
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

router.post('/', requireAuth, messageLimiter, (req, res) => {
  const body = req.body || {}
  const values = {
    family_id: req.familyId,
    type: body.type,
    autor_name: cleanText(body.autorName, 60) || '',
    contact: cleanText(body.contact, 120),
    text: cleanText(body.text, 4000),
    page: cleanText(body.page, 200),
    user_agent: cleanText(req.get('user-agent'), 300)
  }
  if (!TYPES.includes(values.type)) return res.status(400).json({ error: 'Bitte „Feedback“ oder „Problem melden“ wählen' })
  if (!values.text) return res.status(400).json({ error: 'Bitte schreib eine Nachricht' })

  db.prepare(
    `INSERT INTO admin_messages (family_id, type, autor_name, contact, text, page, user_agent)
     VALUES (@family_id, @type, @autor_name, @contact, @text, @page, @user_agent)`
  ).run(values)
  res.status(201).json({ sent: true })
})

module.exports = router
