const express = require('express')
const { denyDemoWrites } = require('../../middleware/auth')
const {
  NOT_FOUND_MESSAGE,
  validateTermin,
  findOwnTermin,
  insertTermin,
  updateTermin,
  deleteTermin,
  addAbsage,
  removeAbsage,
  ownTermin,
  ownTerminList
} = require('../../lib/partnerTermine')

// Phase V4a: der Kalender des eigenen Partners (lib/partnerTermine.js) - Termine und Serien, ohne Freigabe sofort auf
// dem Portal und auf der Karte in "Entdecken". Läuft hinter middleware/partnerArea.js requirePartnerArea (req.partner
// ist gesetzt), für Partner- und Tierheim-Bereiche. Nur eigene Termine - alles andere ist 404. Demo-Sitzungen lesen nur.
// Jede Änderung antwortet mit der ganzen Liste (wie GET, samt Übersicht), POST und PUT dazu mit dem Termin selbst.

const router = express.Router()

function sendError(res, next, err) {
  if (err.status) return res.status(err.status).json({ error: err.message })
  next(err)
}

// Der eigene Termin zur :id - oder 404 direkt über res (dann undefined).
function ownOr404(req, res) {
  const termin = findOwnTermin(req.partner.id, req.params.id)
  if (!termin) res.status(404).json({ error: NOT_FOUND_MESSAGE })
  return termin
}

function listResponse(req, termin) {
  return { ...ownTerminList(req.partner.id), ...(termin ? { termin: ownTermin(termin) } : {}) }
}

router.get('/', (req, res) => {
  res.json(listResponse(req))
})

router.post('/', denyDemoWrites, (req, res, next) => {
  try {
    const termin = insertTermin(req.partner, validateTermin(req.body))
    res.status(201).json(listResponse(req, termin))
  } catch (err) {
    sendError(res, next, err)
  }
})

// Ändert die ganze Serie (bzw. den einzelnen Termin) - dieselbe Prüfung wie beim Anlegen.
router.put('/:id', denyDemoWrites, (req, res, next) => {
  try {
    const existing = ownOr404(req, res)
    if (!existing) return
    const termin = updateTermin(existing.id, validateTermin(req.body, { existing }))
    res.json(listResponse(req, termin))
  } catch (err) {
    sendError(res, next, err)
  }
})

router.delete('/:id', denyDemoWrites, (req, res) => {
  const termin = ownOr404(req, res)
  if (!termin) return
  deleteTermin(termin.id)
  res.json(listResponse(req))
})

// { datum } - "diesen Termin absagen": ein Tag der Serie (oder der einzelne Termin) fällt aus.
router.post('/:id/absagen', denyDemoWrites, (req, res, next) => {
  try {
    const termin = ownOr404(req, res)
    if (!termin) return
    addAbsage(termin, (req.body || {}).datum)
    res.json(listResponse(req, termin))
  } catch (err) {
    sendError(res, next, err)
  }
})

// "wieder stattfinden lassen".
router.delete('/:id/absagen/:datum', denyDemoWrites, (req, res, next) => {
  try {
    const termin = ownOr404(req, res)
    if (!termin) return
    removeAbsage(termin, req.params.datum)
    res.json(listResponse(req, termin))
  } catch (err) {
    sendError(res, next, err)
  }
})

module.exports = router
