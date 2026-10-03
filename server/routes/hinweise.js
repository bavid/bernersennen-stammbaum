const express = require('express')
const config = require('../config')
const { listPublicHinweise } = require('../lib/hinweise')

// Phase N Task 5: GET /api/hinweise - die laufenden globalen Hinweise für das Band oben auf jeder Seite (lib/hinweise.js):
// ohne Login, für alle gleich, höchstens fünf, nur { id, titel, text, stufe }. "public, no-cache": Browser und Proxy
// dürfen die Antwort halten, fragen aber jedes Mal per ETag nach (meist ein leeres 304) - schaltet der Admin einen
// Hinweis aus, ist er beim nächsten Laden weg. Den Beispiel-Hinweis (is_demo) gibt es außerhalb der Produktion.
const router = express.Router()

const PUBLIC_CACHE = 'public, no-cache'

router.get('/', (req, res) => {
  res.setHeader('Cache-Control', PUBLIC_CACHE)
  res.json({ hinweise: listPublicHinweise({ includeDemo: config.appEnv !== 'production' }) })
})

module.exports = router
