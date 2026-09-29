const express = require('express')
const { denyDemoWrites } = require('../../middleware/auth')
const { listMessages, countUnread, markRead, deleteMessage, ownMessage } = require('../../lib/partnerMessages')

// Phase P2 Task 9: der Posteingang des eigenen Partners - Nachrichten aus dem Kontaktformular des Portals
// (lib/partnerMessages.js). Läuft hinter middleware/partnerArea.js requirePartnerArea (req.partner ist
// gesetzt). Nur eigene Nachrichten, alles andere 404. Demo-Sitzungen lesen nur. Das Öffnen räumt vorher
// Nachrichten älter als 180 Tage weg (Datenschutz, siehe db.js).

const router = express.Router()

const NOT_FOUND = 'Diese Nachricht gibt es nicht'

// { messages: neueste zuerst, unread: Anzahl ungelesener }
router.get('/', (req, res) => {
  const messages = listMessages(req.partner.id).map(ownMessage)
  res.json({ messages, unread: countUnread(req.partner.id) })
})

router.post('/:id/read', denyDemoWrites, (req, res) => {
  const message = markRead(req.partner.id, req.params.id)
  if (!message) return res.status(404).json({ error: NOT_FOUND })
  res.json(ownMessage(message))
})

router.delete('/:id', denyDemoWrites, (req, res) => {
  if (!deleteMessage(req.partner.id, req.params.id)) return res.status(404).json({ error: NOT_FOUND })
  res.status(204).end()
})

module.exports = router
