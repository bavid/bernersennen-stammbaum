'use strict'

// Bereichsarten (families.art) - ohne jede Abhängigkeit, damit auch Module, die lib/context.js selbst braucht
// (z. B. lib/partnerMessages.js für unread in buildMe), sie ohne Require-Zyklus nutzen können. lib/context.js
// exportiert beide Konstanten unverändert weiter; bestehende Importe von dort bleiben gültig.

// partner (Phase P Task 1): Bereich eines Partners, der kein Tierheim ist (Hundeschule, Hundesalon,
// Betreuung, ...) - angelegt vom Admin über routes/admin.js POST /partners/:id/area. Keine Tiere.
const ART = { zuhause: 'zuhause', rudel: 'rudel', tierheim: 'tierheim', partner: 'partner' }

// Bereichsarten, die zu einem Partner gehören (families.partner_id zeigt dann auf "seinen" Partner). Ein
// Zuhause trägt partner_id nur als Herkunft ("kam über Partner X") und zählt deshalb NICHT dazu.
const PARTNER_AREA_ARTS = [ART.tierheim, ART.partner]

module.exports = { ART, PARTNER_AREA_ARTS }
