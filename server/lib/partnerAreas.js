'use strict'

// Bereich eines Partners (art 'tierheim' für Tierheime/Vermittlungen, 'partner' für alle anderen Typen):
// höchstens einer pro Partner. Angelegt vom Admin für einen bestehenden Partner (routes/admin.js POST
// /partners/:id/area) oder vom Partner selbst per Partner-Zugang-Gutschein (lib/partnerAccess.js) -
// beide Wege nutzen insertPartnerArea, damit die Bereichs-Zeile überall gleich aussieht.

const { ART, PARTNER_AREA_ARTS } = require('./context')
const { SHELTER_TYP_VALUES } = require('./partners')

// Nur diese beiden Arten zählen als Bereich eines Partners: ein Zuhause trägt families.partner_id bloß
// als Herkunft ("kam über Partner X", lib/vouchers.js redeemVoucher).
const PARTNER_AREA_ARTS_SQL = PARTNER_AREA_ARTS.map((art) => `'${art}'`).join(', ')

function areaArtForTyp(typ) {
  return SHELTER_TYP_VALUES.includes(typ) ? ART.tierheim : ART.partner
}

function areaLabel(art) {
  return art === ART.tierheim ? 'Tierheim-Bereich' : 'Partner-Bereich'
}

function findPartnerArea(db, partnerId) {
  return db
    .prepare(`SELECT id, art FROM families WHERE partner_id = ? AND art IN (${PARTNER_AREA_ARTS_SQL}) ORDER BY id LIMIT 1`)
    .get(partnerId)
}

// Legt die Bereichs-Familie an. Der Zugangsschlüssel funktioniert wie ein Gutschein-Code: gespeichert
// wird nur sein Hash (accessKeyHash, siehe lib/codes.js hashCode). voucherId: der Partner-Zugang, aus
// dem der Bereich entstand (null, wenn der Admin ihn direkt anlegt). Gibt { familyId, art } zurück.
function insertPartnerArea(db, { partner, accessKeyHash, voucherId = null }) {
  const art = areaArtForTyp(partner.typ)
  const familyId = db
    .prepare(
      `INSERT INTO families (name, password_hash, art, theme, partner_id, legacy_password, access_key_hash, voucher_id, is_demo)
       VALUES (?, '!', ?, 'standard', ?, 0, ?, ?, ?)`
    )
    // security-review Phase T Finding 13: ein Bereich für einen Demo-Partner muss selbst is_demo=1
    // tragen - sonst wäre er (anders als jeder andere Demo-Bereich) außerhalb von dev/staging ohne
    // ?demo=1 oder eine Demo-Sitzung sichtbar/nutzbar, obwohl der Partner es nicht ist.
    .run(partner.name, art, partner.id, accessKeyHash, voucherId, partner.is_demo ? 1 : 0).lastInsertRowid
  return { familyId: Number(familyId), art }
}

module.exports = { PARTNER_AREA_ARTS_SQL, areaArtForTyp, areaLabel, findPartnerArea, insertPartnerArea }
