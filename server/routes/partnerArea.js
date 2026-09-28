const express = require('express')
const { requirePartnerArea } = require('../middleware/partnerArea')
const profileRoutes = require('./partnerArea/profile')

// Phase P Task 3 (docs/superpowers/plans/2026-09-29-phase-p-partnerbereich.md): alle Endpunkte des
// Partner-Bereichs unter /api/partner-area. Jede Anfrage braucht eine Sitzung in einem Partner-Bereich
// (middleware/partnerArea.js); die Schreibsperre für Demo-Sitzungen hängt an den einzelnen Schreib-Routen.
// Die Teilbereiche liegen in routes/partnerArea/.

const router = express.Router()

router.use(requirePartnerArea)
router.use('/profile', profileRoutes)

module.exports = router
