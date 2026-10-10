'use strict'

const express = require('express')
const config = require('../config')
const db = require('../db')
const { requireAdmin } = require('../middleware/admin')
const { noStore } = require('../lib/noStoreResponse')
const { cleanId } = require('../lib/validate')
const { AKTION, logAdminAction, partnerZiel } = require('../lib/adminLog')
const { MAX_VORGESTELLT, parseAn, countVorgestellt, setVorgestellt } = require('../lib/partnerVorgestellt')
const { clearCommunityCache, readDemoPartnerErlaubt, setDemoPartnerErlaubt, bannerVorschau } = require('../lib/community')
const { CHIP_KEYS, MAX_TEXT, readBannerConfig, validateBannerConfig, saveBannerConfig, listPublicPartners, partnerFotos } = require('../lib/communityBanner')

// Laufband der Startseite: der Admin stellt Partner vor (lib/partnerVorgestellt.js, höchstens drei) und schaltet die
// Demo-Ausnahme (lib/community.js community_demo_partner_erlaubt). Eingehängt unter /api/admin in app.js wie
// routes/adminPartnerSichtbar.js: 404-Gate ohne Passwort-Hash, requireAdmin und no-store je Route. Änderungen landen im
// Admin-Protokoll (nur das Objekt) und leeren den Zwischenspeicher des Laufbands.
// - PUT /partners/:id/vorgestellt   { an }       -> { id, vorgestellt }   (409 beim vierten)
// - GET /community                               -> { demoPartnerErlaubt, vorgestellt, max }
// - PUT /community/demo-partner     { erlaubt }  -> { demoPartnerErlaubt }
// - GET /community/banner  -> { banner, partners (öffentliche, mit Fotos), vorschau { zahlen, vorgestellt }, chipKeys,
//                              maxText, demoPartnerErlaubt }
// - PUT /community/banner  { partnerId, bis, chips, text, link } -> { banner }   (lib/communityBanner.js, 400 bei Unsinn)
const router = express.Router()

const findPartner = db.prepare('SELECT id FROM partners WHERE id = ?')
const ZIEL_DEMO_PARTNER = 'einstellung:community-demo-partner'
const ZIEL_BANNER = 'einstellung:community-banner'

router.use((req, res, next) => {
  if (!config.adminPasswordHash) return res.status(404).json({ error: 'Nicht gefunden' })
  next()
})

const guarded = [noStore, requireAdmin]

function sendError(res, next, err) {
  if (!err.status) return next(err)
  res.status(err.status).json({ error: err.message })
}

router.put('/partners/:id/vorgestellt', guarded, (req, res, next) => {
  try {
    const id = cleanId(req.params.id)
    if (!id || !findPartner.get(id)) return res.status(404).json({ error: 'Diesen Partner gibt es nicht' })
    const { vorgestellt, changed } = setVorgestellt(id, parseAn(req.body))
    if (changed) {
      logAdminAction(vorgestellt ? AKTION.partnerVorgestellt : AKTION.partnerNichtVorgestellt, partnerZiel(id))
      clearCommunityCache()
    }
    res.json({ id, vorgestellt })
  } catch (err) {
    sendError(res, next, err)
  }
})

router.get('/community', guarded, (req, res) => {
  res.json({ demoPartnerErlaubt: readDemoPartnerErlaubt(), vorgestellt: countVorgestellt(), max: MAX_VORGESTELLT })
})

router.put('/community/demo-partner', guarded, (req, res) => {
  const erlaubt = req.body && typeof req.body === 'object' ? req.body.erlaubt : undefined
  if (typeof erlaubt !== 'boolean') return res.status(400).json({ error: '„erlaubt“ muss true oder false sein' })
  const { demoPartnerErlaubt, changed } = setDemoPartnerErlaubt(erlaubt)
  if (changed) logAdminAction(AKTION.communityDemoPartnerGeaendert, ZIEL_DEMO_PARTNER)
  res.json({ demoPartnerErlaubt })
})

router.get('/community/banner', guarded, (req, res) => {
  res.json({
    banner: readBannerConfig(),
    partners: listPublicPartners().map((partner) => ({ ...partner, fotos: partnerFotos(partner.id) })),
    vorschau: bannerVorschau(),
    chipKeys: CHIP_KEYS,
    maxText: MAX_TEXT,
    demoPartnerErlaubt: readDemoPartnerErlaubt()
  })
})

router.put('/community/banner', guarded, (req, res, next) => {
  try {
    const { config: banner, changed } = saveBannerConfig(validateBannerConfig(req.body))
    if (changed) {
      logAdminAction(AKTION.communityBannerGeaendert, ZIEL_BANNER)
      clearCommunityCache()
    }
    res.json({ banner })
  } catch (err) {
    sendError(res, next, err)
  }
})

module.exports = router
