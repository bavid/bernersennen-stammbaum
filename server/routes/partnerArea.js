const express = require('express')
const { requirePartnerArea } = require('../middleware/partnerArea')
const profileRoutes = require('./partnerArea/profile')
const einblickeRoutes = require('./partnerArea/einblicke')
const previewRoutes = require('./partnerArea/preview')
const postsRoutes = require('./partnerArea/posts')
const messagesRoutes = require('./partnerArea/messages')
const vouchersRoutes = require('./partnerArea/vouchers')
const termineRoutes = require('./partnerArea/termine')
const telegramRoutes = require('./partnerArea/telegram')
const visitenkarteRoutes = require('./partnerArea/visitenkarte')

// Phase P Task 3 (docs/superpowers/plans/2026-09-29-phase-p-partnerbereich.md): alle Endpunkte des
// Partner-Bereichs unter /api/partner-area. Jede Anfrage braucht eine Sitzung in einem Partner-Bereich
// (middleware/partnerArea.js); die Schreibsperre für Demo-Sitzungen hängt an den einzelnen Schreib-Routen.
// Die Teilbereiche liegen in routes/partnerArea/.

const router = express.Router()

router.use(requirePartnerArea)
router.use('/profile', profileRoutes)
router.use('/einblicke', einblickeRoutes)
router.use('/preview', previewRoutes)
router.use('/posts', postsRoutes)
router.use('/messages', messagesRoutes)
// Phase 5 Task 4: Kunden-Gutschein-Stapel und Druckdaten (lesend, mit no-store).
router.use('/vouchers', vouchersRoutes)
// Phase V4a: der Kalender (Termine, Serien und Absagen).
router.use('/termine', termineRoutes)
// Phase V4b: Telegram-Hinweise (Verbinden, Schalter, Testnachricht, Trennen).
router.use('/telegram', telegramRoutes)
// Phase V5: Visitenkarten-Designer (Gestaltung speichern, Gutschein-Codes für den Druck - no-store).
router.use('/visitenkarte', visitenkarteRoutes)

module.exports = router
