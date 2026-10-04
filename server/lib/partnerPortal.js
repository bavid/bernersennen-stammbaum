'use strict'

// Phase P Task 3c: die Portal-Antwort eines Partners - EINE Stelle für das öffentliche Portal
// (routes/partners.js GET /api/public/partners/:slug) und die Kundensicht des Partners selbst
// (routes/partnerArea/preview.js GET /preview/portal), damit beide dieselbe Form liefern. Ob der Partner
// überhaupt gezeigt werden darf (aktiv, nicht gesperrt, Demo), entscheidet der jeweilige Aufrufer.

const { publicPartner } = require('./partners')
const { listVisibleEinblicke, publicEinblick } = require('./einblicke')
const { listBanner, publicBanner, readLayout } = require('./partnerBanner')
const { contactFormFlags } = require('./partnerMessages')
const { publicTermine } = require('./partnerTermine')

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
    // Phase V4b: Ansprechperson neben "Schreib uns" und im Kontaktformular - reiner Text, optional.
    ansprechperson: partner.ansprechperson ?? null,
    farbe: partner.farbe,
    // Phase V4b: 1-3 Bannerfotos für den Kopf (öffentlich über /public-media, in der Kundensicht über /uploads) und
    // (Feedback-Runde) ihr Layout - fehlen Fotos dafür, nimmt der Client das nächstkleinere (client/src/lib/partnerBanner.js).
    banner: listBanner(partner.id).map((row) => publicBanner(row, { preview })),
    bannerLayout: readLayout(partner.id),
    // Feedback-Runde: keine Demo-Kennzeichen (früher shelterDemo/partnerDemo für die Demo-Knöpfe) - Portale nennen keine
    // Demo, die gibt es auf der Startseite.
    // Phase P Task 3b: höchstens 60 nicht ausgeblendete Einblicke, neueste zuerst.
    einblicke: listVisibleEinblicke(partner.id).map((row) => publicEinblick(row, { preview })),
    // Phase V4a: kommende Termine der nächsten zwölf Monate (lib/partnerTermine.js), abgesagte mit abgesagt: true.
    termine: publicTermine(partner.id)
  }
}

module.exports = { buildPortal }
