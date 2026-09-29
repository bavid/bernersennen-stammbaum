const express = require('express')
const rateLimit = require('express-rate-limit')
const config = require('../config')
const { rejectHoneypot } = require('../middleware/abuse')
const { ipKeyGenerator } = require('../lib/rateLimitKey')
const { checkEmailDomain, EMAIL_DOMAIN_RESULT } = require('../lib/emailCheck')
const { validateAnfrage, insertAnfrage, httpError, EMAIL_UNKNOWN_MESSAGE, TYP } = require('../lib/anfragen')
const { notify, EREIGNIS } = require('../lib/notify')

// Phase N Task 1: öffentliche Anfragen - "Noch keinen Gutschein?" (Login-Seite) und "Partner-Zugang anfragen"
// (/partner-werden). Eingehängt unter /api/public/anfragen in app.js. Prüfung und Speichern: lib/anfragen.js.
const router = express.Router()

const ONE_HOUR = 60 * 60 * 1000

// Eigenes, knappes Limit pro IP (Standard 3 je Stunde, config.anfrageRateLimit) zusätzlich zum globalen
// apiLimiter, mit IPv6-Maske (lib/rateLimitKey.js). Zählt jede Anfrage, auch abgelehnte - sonst ließe sich das
// Formular zum Ausprobieren von Adressen (DNS-Nachfrage) missbrauchen.
const anfrageLimiter = rateLimit({
  windowMs: ONE_HOUR,
  limit: config.anfrageRateLimit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  message: { error: 'Zu viele Anfragen in kurzer Zeit – bitte später noch einmal versuchen.' }
})

// POST /api/public/anfragen { typ, name?, email, nachricht?, firma?, partnerTyp?, plz?, website }
// website ist der Honigtopf (middleware/abuse.js). Die E-Mail muss eine Domain haben, die es gibt (MX, sonst A/AAAA,
// lib/emailCheck.js) - hängt das DNS, wird die Anfrage trotzdem angenommen. Eine gleiche offene Anfrage aus den
// letzten 24 Stunden legt nichts neu an, die Antwort ist dieselbe: 201 { ok: true }, nie ein Echo der Eingaben.
// Inhalte und E-Mail werden nie geloggt. Eine neue Anfrage meldet die Admin-Benachrichtigung (lib/notify.js) - ohne
// "Details mitsenden" nur, DASS es eine gibt. Auch aus einer Demo-Sitzung: wer sich die Demo ansieht und einen
// Gutschein möchte, fragt direkt dort an - eine Anfrage gehört keinem Bereich, sie geht an den Admin.
router.post('/', anfrageLimiter, rejectHoneypot, async (req, res, next) => {
  try {
    const clean = validateAnfrage(req.body)
    const domain = await checkEmailDomain(clean.email)
    if (domain === EMAIL_DOMAIN_RESULT.ungueltig) throw httpError(400, EMAIL_UNKNOWN_MESSAGE)
    const { created } = insertAnfrage(clean)
    res.status(201).json({ ok: true })
    // Phase N Task 2: nur für eine neue Zeile (ein Duplikat meldet nichts), asynchron - die Antwort wartet nicht.
    if (created) {
      const ereignis = clean.typ === TYP.partner ? EREIGNIS.partnerAnfrage : EREIGNIS.gutscheinAnfrage
      notify(ereignis, { name: clean.name, email: clean.email, firma: clean.firma, partnerTyp: clean.partner_typ })
    }
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

module.exports = router
