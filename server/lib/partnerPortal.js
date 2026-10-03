'use strict'

// Phase P Task 3c: die Portal-Antwort eines Partners - EINE Stelle für das öffentliche Portal
// (routes/partners.js GET /api/public/partners/:slug) und die Kundensicht des Partners selbst
// (routes/partnerArea/preview.js GET /preview/portal), damit beide dieselbe Form liefern. Ob der Partner
// überhaupt gezeigt werden darf (aktiv, nicht gesperrt, Demo), entscheidet der jeweilige Aufrufer.

const db = require('../db')
const { publicPartner } = require('./partners')
const { listVisibleEinblicke, publicEinblick } = require('./einblicke')
const { findDemoPartnerArea } = require('./partnerAreas')
const { contactFormFlags } = require('./partnerMessages')
const { publicTermine } = require('./partnerTermine')

// Gibt es für diesen Partner überhaupt einen Tierheim-Bereich? Ohne ihn wäre "Demo als Tierheim ansehen"
// (Phase T Task 6) ein toter Knopf: api.demo({ as: 'tierheim' }) schlägt fehl, wenn der Demo-Partner (noch)
// keinen eigenen Tierheim-Bereich hat - der Knopf hängt darum an dessen tatsächlicher Existenz.
const findShelterFamily = db.prepare("SELECT id FROM families WHERE partner_id = ? AND art = 'tierheim'")

// preview: true = Kundensicht des Partners - Einblick-Fotos über /uploads statt /public-media (ein
// Entwurf, ein pausierter oder gesperrter Partner gibt über /public-media nichts frei, der eigene Bereich
// sieht die Dateien aber über /uploads, lib/uploadAccess.js).
function buildPortal(partner, { preview = false } = {}) {
  return {
    ...publicPartner(partner),
    portal_titel: partner.portal_titel,
    portal_text: partner.portal_text,
    spenden_url: partner.spenden_url,
    vermittlung_url: partner.vermittlung_url,
    // Phase P Task 1: Link zum eigenen Kontaktformular des Partners (nur http(s), siehe validatePartner).
    kontakt_formular_url: partner.kontakt_formular_url,
    // Phase P2 Task 9: "Schreib uns" - true genau dann, wenn das Kontaktformular eine Nachricht annähme; ein
    // Demo-Partner zusätzlich kontaktformularDemo (lib/partnerMessages.js contactFormFlags).
    ...contactFormFlags(partner, { preview }),
    farbe: partner.farbe,
    // Phase T Task 6: der Client zeigt für Demo-Partner mit einem tatsächlich bestehenden Demo-Tierheim
    // zusätzlich "Demo als Tierheim ansehen" (PartnerPortalPage.jsx) - ohne extra Anfrage.
    ...(partner.is_demo && findShelterFamily.get(partner.id) ? { shelterDemo: true } : {}),
    // Phase P1 Task 4: ebenso "Demo als Partner ansehen", wenn es einen Demo-Partner-Bereich gibt - dieselbe
    // Regel wie POST /api/demo { as: 'partner', slug } (lib/partnerAreas.js findDemoPartnerArea).
    ...(partner.is_demo && findDemoPartnerArea(db, partner.slug) ? { partnerDemo: true } : {}),
    // Phase P Task 3b: höchstens 60 nicht ausgeblendete Einblicke, neueste zuerst.
    einblicke: listVisibleEinblicke(partner.id).map((row) => publicEinblick(row, { preview })),
    // Phase V4a: kommende Termine der nächsten zwölf Monate (lib/partnerTermine.js), abgesagte mit abgesagt: true.
    termine: publicTermine(partner.id)
  }
}

module.exports = { buildPortal }
