'use strict'

// Phase M „Mein Revier“: Not-Aus des Admins für öffentliche Profile (lib/revierFolgen.js). GET /revier listet alle
// eingeschalteten oder gesperrten Profile (ohne PLZ), PUT /revier/:slug { gesperrt } schaltet eines aus bzw. wieder zu -
// gesperrt ist es mit der nächsten Anfrage überall unsichtbar. Protokolliert (admin_log, ziel 'revier:<slug>').

const express = require('express')
const { requireAdmin } = require('../middleware/admin')
const { noStore } = require('../lib/noStoreResponse')
const { adminRevierListe, setRevierGesperrt } = require('../lib/revier')

const router = express.Router()

router.get('/revier', noStore, requireAdmin, (req, res) => res.json(adminRevierListe()))

router.put('/revier/:slug', noStore, requireAdmin, (req, res, next) => {
  try {
    res.json(setRevierGesperrt(req.params.slug, Boolean(req.body?.gesperrt)))
  } catch (err) {
    if (!err.status) return next(err)
    res.status(err.status).json({ error: err.message })
  }
})

module.exports = router
