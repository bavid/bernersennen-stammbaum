'use strict'

const express = require('express')
const config = require('../config')
const { requireAdmin } = require('../middleware/admin')
const { noStore } = require('../lib/noStoreResponse')
const { cleanId } = require('../lib/validate')
const { AKTION, logAdminAction, spendeZiel, vorleistungZiel } = require('../lib/adminLog')
const { listSpenden, createSpende, updateSpende, deleteSpende } = require('../lib/spenden')
const { createVorleistung, updateVorleistung, deleteVorleistung } = require('../lib/finanzierungVorleistung')
const { meldeSpendenAenderung } = require('../lib/spendenLive')

// „Spenden live“ und „Anschub“ im Admin. Eingehängt unter /api/admin in app.js, GENAU wie routes/adminFinanzierung.js:
// 404 ohne Passwort-Hash, requireAdmin und no-store je Route, jede Änderung im Admin-Protokoll (nur das Objekt, nie
// Beträge, Namen oder Nachrichten). Fehler tragen das Feld ({ error, feld }).
// - GET    /spenden                    -> { spenden }  (neueste zuerst, höchstens 200; mit isDemo)
// - POST   /spenden                    { betragCents, datum, quelle, anzeigename, nachricht, oeffentlich } -> 201 Spende
// - PUT    /spenden/:id                dito -> Spende
// - DELETE /spenden/:id                -> 204
// - POST   /finanzierung/vorleistungen { titel, kategorie, betragCents, datum, notiz } -> 201 Vorleistung
// - PUT    /finanzierung/vorleistungen/:id dito -> Vorleistung
// - DELETE /finanzierung/vorleistungen/:id -> 204
// Jede Änderung (auch an Vorleistungen - sie verschieben „davon gedeckt“) schickt den neuen Stand an offene Live-Ströme.
const router = express.Router()

router.use((req, res, next) => {
  if (!config.adminPasswordHash) return res.status(404).json({ error: 'Nicht gefunden' })
  next()
})

const guarded = [noStore, requireAdmin]

function sendError(res, next, err) {
  if (!err.status) return next(err)
  res.status(err.status).json(err.feld ? { error: err.message, feld: err.feld } : { error: err.message })
}

// POST/PUT/DELETE für eine Liste: create/update/remove aus der lib, aktion { angelegt, geaendert, geloescht }, ziel(id).
function crudRoutes(pfad, { create, update, remove, aktion, ziel, notFound }) {
  router.post(pfad, guarded, (req, res, next) => {
    try {
      const item = create(req.body)
      logAdminAction(aktion.angelegt, ziel(item.id))
      meldeSpendenAenderung()
      res.status(201).json(item)
    } catch (err) {
      sendError(res, next, err)
    }
  })

  router.put(`${pfad}/:id`, guarded, (req, res, next) => {
    try {
      const id = cleanId(req.params.id)
      const item = id ? update(id, req.body) : null
      if (!item) return res.status(404).json({ error: notFound })
      logAdminAction(aktion.geaendert, ziel(id))
      meldeSpendenAenderung()
      res.json(item)
    } catch (err) {
      sendError(res, next, err)
    }
  })

  router.delete(`${pfad}/:id`, guarded, (req, res) => {
    const id = cleanId(req.params.id)
    if (!id || !remove(id)) return res.status(404).json({ error: notFound })
    logAdminAction(aktion.geloescht, ziel(id))
    meldeSpendenAenderung()
    res.status(204).end()
  })
}

router.get('/spenden', guarded, (req, res) => {
  res.json({ spenden: listSpenden() })
})

crudRoutes('/spenden', {
  create: (body) => createSpende(body),
  update: updateSpende,
  remove: deleteSpende,
  aktion: { angelegt: AKTION.spendeErfasst, geaendert: AKTION.spendeGeaendert, geloescht: AKTION.spendeGeloescht },
  ziel: spendeZiel,
  notFound: 'Diese Spende gibt es nicht'
})

crudRoutes('/finanzierung/vorleistungen', {
  create: createVorleistung,
  update: updateVorleistung,
  remove: deleteVorleistung,
  aktion: {
    angelegt: AKTION.finanzierungVorleistungAngelegt,
    geaendert: AKTION.finanzierungVorleistungGeaendert,
    geloescht: AKTION.finanzierungVorleistungGeloescht
  },
  ziel: vorleistungZiel,
  notFound: 'Diese Vorleistung gibt es nicht'
})

module.exports = router
