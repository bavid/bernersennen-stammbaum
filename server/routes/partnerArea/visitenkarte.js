const express = require('express')
const rateLimit = require('express-rate-limit')
const { denyDemoWrites } = require('../../middleware/auth')
const { noStore, sendJsonWithoutEtag } = require('../../lib/noStoreResponse')
const { loadDesign, saveDesign } = require('../../lib/visitenkarte')
const { defaultKurztext } = require('../../lib/visitenkarteDesign')
const { MAX_CODES_PER_REQUEST, validateCodeRequest, stackCounts, takeCodesForPrint } = require('../../lib/visitenkarteGutscheine')

// Phase V5: Visitenkarten-Designer im Partner-Bereich (/api/partner-area/visitenkarte). Läuft hinter
// middleware/partnerArea.js requirePartnerArea (req.partner ist gesetzt).
// - GET /            { design, gespeichert, vorschlag, gutscheine: { offen, ungedruckt }, maxJeAbruf } - nie Codes;
//                    vorschlag ist der Kurztext aus dem Portal (für "Aus dem Portal übernehmen").
// - PUT /            die ganze Gestaltung (lib/visitenkarteDesign.js), Antwort wie GET.
// - POST /gutscheine { anzahl 1-50, nurUngedruckt } -> { codes, fehlen, gutscheine }: offene Codes aus dem EIGENEN
//                    Kunden-Stapel im Klartext, als gedruckt vermerkt (lib/visitenkarteGutscheine.js).
// Jede Antwort no-store ohne ETag (lib/noStoreResponse.js), wie die Druckdaten der Stapel. Demo-Sitzungen lesen nur
// (denyDemoWrites - ihre Karten zeigen Muster-Codes), die Admin-Ansicht sperrt app.js global (denyAdminViewWrites).
// Das Protokoll vermerkt nur Partner-Id und Anzahl, nie einen Code.

const router = express.Router()

const ONE_HOUR = 60 * 60 * 1000
const TEN_MINUTES = 10 * 60 * 1000

function partnerLimiter(windowMs, limit, message) {
  return rateLimit({
    windowMs,
    limit,
    keyGenerator: (req) => `visitenkarte-${req.partner.id}`,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: message }
  })
}

// Codes: 20 Abrufe je Stunde (ein Abruf deckt bis zu fünf Bögen) - genug für Nachschub und Neudrucke, zu wenig, um den
// Stapel nebenbei leerzuziehen. Speichern: 60 je 10 Minuten.
const codesLimiter = partnerLimiter(ONE_HOUR, 20, 'Zu viele Abrufe von Gutscheinen in kurzer Zeit – bitte später noch einmal versuchen.')
const saveLimiter = partnerLimiter(TEN_MINUTES, 60, 'Zu viele Änderungen in kurzer Zeit – bitte kurz warten.')

router.use(noStore)

function owner(req) {
  return { partnerId: req.partner.id, familyId: req.familyId }
}

function stateOf(req) {
  return {
    ...loadDesign(req.partner),
    vorschlag: defaultKurztext(req.partner),
    gutscheine: stackCounts(owner(req)),
    maxJeAbruf: MAX_CODES_PER_REQUEST
  }
}

function sendError(res, next, err) {
  if (err.status) return sendJsonWithoutEtag(res, err.status, { error: err.message })
  next(err)
}

router.get('/', (req, res) => {
  sendJsonWithoutEtag(res, 200, stateOf(req))
})

router.put('/', denyDemoWrites, saveLimiter, (req, res, next) => {
  try {
    saveDesign(req.partner, req.body)
    sendJsonWithoutEtag(res, 200, stateOf(req))
  } catch (err) {
    sendError(res, next, err)
  }
})

router.post('/gutscheine', denyDemoWrites, codesLimiter, (req, res, next) => {
  try {
    const request = validateCodeRequest(req.body)
    const result = takeCodesForPrint(owner(req), request)
    const count = result.codes.length
    console.info(`[partner-area] Visitenkarten für Partner ${req.partner.id}: ${count} ${count === 1 ? 'Gutschein' : 'Gutscheine'} für den Druck vermerkt`)
    sendJsonWithoutEtag(res, 200, result)
  } catch (err) {
    sendError(res, next, err)
  }
})

module.exports = router
