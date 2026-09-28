const express = require('express')
const db = require('../../db')
const { denyDemoWrites } = require('../../middleware/auth')
const { profileResponse, validateProfileUpdate, completeness } = require('../../lib/partnerProfile')
const { handlePartnerLogoUpload } = require('../../lib/partnerLogo')

// Phase P Task 3a: das eigene Profil im Partner-Bereich - lesen, ändern, Logo, veröffentlichen/pausieren.
// Läuft hinter middleware/partnerArea.js requirePartnerArea (req.partner ist gesetzt).

const router = express.Router()

const LOCKED_MESSAGE = 'Gesperrt – bitte meldet euch beim Betreiber.'

const findPartner = db.prepare('SELECT * FROM partners WHERE id = ?')

function sendProfile(res, partnerId, status = 200) {
  res.status(status).json(profileResponse(findPartner.get(partnerId)))
}

router.get('/', (req, res) => {
  sendProfile(res, req.partner.id)
})

// Nur die mitgeschickten, erlaubten Felder ändern sich (lib/partnerProfile.js validateProfileUpdate) -
// Slug, Typ, Status und Sperre nie.
router.put('/', denyDemoWrites, (req, res, next) => {
  try {
    const changes = validateProfileUpdate(req.body, req.partner)
    const columns = Object.keys(changes)
    if (columns.length) {
      db.prepare(`UPDATE partners SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`).run(
        ...columns.map((column) => changes[column]),
        req.partner.id
      )
    }
    sendProfile(res, req.partner.id)
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

router.post('/logo', denyDemoWrites, (req, res, next) => {
  handlePartnerLogoUpload(req, res, next, req.partner.id)
})

// { aktiv: true } veröffentlicht (nur mit vollständigem Profil), { aktiv: false } pausiert. Eine Sperre
// des Betreibers lässt beides nicht zu - entsperren kann nur er (routes/admin.js PUT /partners/:id).
router.post('/publish', denyDemoWrites, (req, res) => {
  const { aktiv } = req.body || {}
  if (typeof aktiv !== 'boolean') return res.status(400).json({ error: '„aktiv“ muss true oder false sein' })
  if (req.partner.gesperrt) return res.status(403).json({ error: LOCKED_MESSAGE })

  if (aktiv) {
    const { ok, fehlt } = completeness(req.partner)
    if (!ok) return res.status(400).json({ error: `Bitte ergänzt noch: ${fehlt.join(', ')}.`, fehlt })
  }
  db.prepare('UPDATE partners SET status = ? WHERE id = ?').run(aktiv ? 'aktiv' : 'pausiert', req.partner.id)
  sendProfile(res, req.partner.id)
})

module.exports = router
