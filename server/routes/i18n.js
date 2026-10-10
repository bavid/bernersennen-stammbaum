'use strict'

// Wörterbücher des Clients (lib/i18nFiles.js, gebaut von client/scripts/build-i18n.mjs) - öffentlich, ohne Login.
// GET /        -> Manifest { languages, versions }, kurz cachebar (5 Minuten): so merkt der Browser neue Fassungen bald.
// GET /:lang   -> die Texte als JSON, ETag = Version. Lange cachebar nur mit passendem ?v=<Version> (die Adresse ändert
//                 sich mit jeder Fassung), sonst jedes Mal nachfragen (If-None-Match -> 304).

const express = require('express')
const config = require('../config')
const { createI18nFiles } = require('../lib/i18nFiles')

const MANIFEST_CACHE = 'public, max-age=300'
const VERSIONED_CACHE = 'public, max-age=31536000, immutable'
const REVALIDATE_CACHE = 'public, no-cache'
const NOT_FOUND = 'Nicht gefunden'

function createI18nRouter(distDir = config.clientDist) {
  const files = createI18nFiles(distDir)
  const router = express.Router()

  router.get('/', (req, res) => {
    const manifest = files.manifest()
    if (!manifest) return res.status(404).json({ error: NOT_FOUND })
    res.setHeader('Cache-Control', MANIFEST_CACHE)
    res.json(manifest)
  })

  router.get('/:lang', (req, res) => {
    const found = files.messages(req.params.lang)
    if (!found) return res.status(404).json({ error: NOT_FOUND })
    res.setHeader('Cache-Control', req.query.v === found.version ? VERSIONED_CACHE : REVALIDATE_CACHE)
    res.setHeader('ETag', `"${found.version}"`)
    res.type('application/json').send(found.body)
  })

  return router
}

module.exports = { createI18nRouter }
