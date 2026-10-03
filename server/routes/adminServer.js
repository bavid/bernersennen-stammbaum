const express = require('express')
const config = require('../config')
const { requireAdmin } = require('../middleware/admin')
const { noStore } = require('../lib/noStoreResponse')
const { serverMonitor } = require('../lib/serverMetrics')

// Phase G Task 6: Admin-Reiter „Server“ - GET /api/admin/server liefert Arbeitsspeicher, Speicherplatz, Last, Laufzeit,
// Größen, Stand, Verlauf und Schwellen (lib/serverMetrics.js). Eingehängt unter /api/admin in app.js, GENAU wie
// routes/adminNotify.js: derselbe 404-ohne-Passwort-Hash-Gate und requireAdmin. no-store, auch für 401. Die teuren Teile
// (Ordnergrößen) sind zwischengespeichert - ein Aufruf liest nur /proc/meminfo, statfs und loadavg. Die Antwort enthält nur
// Zahlen und feste Schlüssel, nie Pfade oder Hostnamen.
const router = express.Router()

router.use((req, res, next) => {
  if (!config.adminPasswordHash) return res.status(404).json({ error: 'Nicht gefunden' })
  next()
})

router.get('/server', noStore, requireAdmin, async (req, res, next) => {
  try {
    res.json(await serverMonitor().status())
  } catch (err) {
    next(err)
  }
})

module.exports = router
