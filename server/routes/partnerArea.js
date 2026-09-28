const express = require('express')
const { requirePartnerArea } = require('../middleware/partnerArea')
const profileRoutes = require('./partnerArea/profile')
const einblickeRoutes = require('./partnerArea/einblicke')

// Phase P Task 3 (docs/superpowers/plans/2026-09-29-phase-p-partnerbereich.md): alle Endpunkte des
// Partner-Bereichs unter /api/partner-area. Jede Anfrage braucht eine Sitzung in einem Partner-Bereich
// (middleware/partnerArea.js); die Schreibsperre für Demo-Sitzungen hängt an den einzelnen Schreib-Routen.
// Die Teilbereiche liegen in routes/partnerArea/.

const router = express.Router()

router.use(requirePartnerArea)
router.use('/profile', profileRoutes)
router.use('/einblicke', einblickeRoutes)

module.exports = router
