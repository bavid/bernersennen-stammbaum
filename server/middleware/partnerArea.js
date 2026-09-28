const db = require('../db')
const { requireSession } = require('./auth')
const { PARTNER_AREA_ARTS } = require('../lib/context')

// Phase P Task 3: Zugang zu /api/partner-area/*. Der AKTIVE Bereich (req.familyId) muss ein Partner-Bereich
// sein (art 'partner' oder 'tierheim', lib/context.js PARTNER_AREA_ARTS) und auf einen bestehenden Partner
// zeigen - ein Zuhause trägt partner_id nur als Herkunft und zählt nicht. Setzt req.partner (die ganze
// partners-Zeile) und req.partnerAreaArt. Lesen dürfen auch Demo-Sitzungen; die Schreibsperre hängt
// jede Schreib-Route selbst davor (middleware/auth.js denyDemoWrites).
const NOT_A_PARTNER_AREA = 'Nur im Partner-Bereich möglich'

const findArea = db.prepare('SELECT art, partner_id FROM families WHERE id = ?')
const findPartner = db.prepare('SELECT * FROM partners WHERE id = ?')

function requirePartnerArea(req, res, next) {
  requireSession(req, res, () => {
    const area = findArea.get(req.familyId)
    const isPartnerArea = Boolean(area) && PARTNER_AREA_ARTS.includes(area.art) && area.partner_id !== null
    const partner = isPartnerArea ? findPartner.get(area.partner_id) : null
    if (!partner) return res.status(403).json({ error: NOT_A_PARTNER_AREA })
    req.partner = partner
    req.partnerAreaArt = area.art
    next()
  })
}

module.exports = { requirePartnerArea, NOT_A_PARTNER_AREA }
