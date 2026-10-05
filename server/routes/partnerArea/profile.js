const express = require('express')
const db = require('../../db')
const { denyDemoWrites } = require('../../middleware/auth')
const { profileResponse, validateProfileUpdate, completeness } = require('../../lib/partnerProfile')
const { handlePartnerLogoUpload } = require('../../lib/partnerLogo')
const { countVisibleEinblicke } = require('../../lib/einblicke')
const { listBanner, readLayout } = require('../../lib/partnerBanner')
const { parseAn, setUeberallSichtbar } = require('../../lib/ueberallSichtbar')
const bannerRoutes = require('./banner')

// Phase P Task 3a: das eigene Profil im Partner-Bereich - lesen, ändern, Logo, veröffentlichen/pausieren.
// Läuft hinter middleware/partnerArea.js requirePartnerArea (req.partner ist gesetzt).

const router = express.Router()

const LOCKED_MESSAGE = 'Gesperrt – bitte meldet euch beim Betreiber.'

const findPartner = db.prepare('SELECT * FROM partners WHERE id = ?')

// Die Empfehlung "mindestens ein Einblick" zählt nur sichtbare (nicht vom Admin ausgeblendete) Einblicke.
function sendProfile(res, partnerId) {
  res.json(
    profileResponse(findPartner.get(partnerId), {
      einblickCount: countVisibleEinblicke(partnerId),
      banner: listBanner(partnerId),
      bannerLayout: readLayout(partnerId)
    })
  )
}

// Phase V4b: Bannerfotos für den Kopf des Portals (routes/partnerArea/banner.js).
router.use('/banner', bannerRoutes)

router.get('/', (req, res) => {
  sendProfile(res, req.partner.id)
})

// Nur die mitgeschickten, erlaubten Felder ändern sich (lib/partnerProfile.js validateProfileUpdate) -
// Slug, Typ, Status und Sperre nie. Ein aktives Profil darf dabei keine Pflichtangabe verlieren (400 mit
// fehlt, siehe assertStaysComplete).
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
    if (err.status) return res.status(err.status).json({ error: err.message, ...(err.fehlt ? { fehlt: err.fehlt } : {}) })
    next(err)
  }
})

// Phase F: „Überall sichtbar“ (lib/ueberallSichtbar.js) - { an: true|false }. Wirkt nur, solange das
// Profil öffentlich ist (Entdecken zeigt nur aktive, nicht gesperrte Partner); eine Sperre des Profils lässt den Schalter
// nicht zu, und hat das Team die Hervorhebung ausgeschaltet (ueberall_gesperrt), antwortet die Lib mit 403.
router.put('/ueberall-sichtbar', denyDemoWrites, (req, res, next) => {
  try {
    if (req.partner.gesperrt) return res.status(403).json({ error: LOCKED_MESSAGE })
    setUeberallSichtbar(req.partner.id, parseAn(req.body))
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
