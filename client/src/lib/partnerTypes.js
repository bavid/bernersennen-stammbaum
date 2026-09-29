// Gemeinsame Beschriftungen für Partner-Typ und -Kennzeichnung, geteilt zwischen PartnerCard,
// PartnerPortalPage, PlaceList und AdminPartners. Züchter gibt es hier bewusst nicht
// (server/lib/partners.js TYP_VALUES kennt den Typ nicht) - Reihenfolge wie dort.
export const TYPE_LABELS = {
  tierheim: 'Tierheim',
  vermittlung: 'Vermittlung',
  hundeschule: 'Hundeschule',
  hundesalon: 'Hundesalon',
  betreuung: 'Betreuung',
  futter: 'Futter',
  sonstige: 'Sonstiges'
}

// Ausführlichere Beschriftungen für die Typ-Auswahl beim Einrichten eines Partner-Profils
// (PartnerSetupFields) - dort muss sich jeder Partner auf Anhieb wiederfinden.
export const SETUP_TYPE_OPTIONS = [
  { value: 'tierheim', label: 'Tierheim' },
  { value: 'vermittlung', label: 'Vermittlungsstelle' },
  { value: 'hundeschule', label: 'Hundeschule' },
  { value: 'hundesalon', label: 'Hundesalon' },
  { value: 'betreuung', label: 'Betreuung (Hundesitter, Tagesstätte, Pension)' },
  { value: 'futter', label: 'Futter & Zubehör' },
  { value: 'sonstige', label: 'Sonstiges' }
]

export function setupTypeLabel(typ) {
  return SETUP_TYPE_OPTIONS.find((option) => option.value === typ)?.label || typ
}

// Öffentliche Kennzeichnung (server/lib/partners.js publicPartner: badge 'partner' bei ist_partner, sonst
// 'geprueft'). Seit Phase U zeigt eine Karte höchstens EIN ruhiges Merkmal: offizielle Partner ein kleines
// Pfoten-Zeichen "Partner" (PartnerMark), alle anderen keins - keine zwei konkurrierenden Pillen mehr.
export const PARTNER_MARK_LABEL = 'Partner'

export function isOfficialPartner(badge) {
  return badge === 'partner'
}

// Status eines Partners (server/lib/partners.js STATUS_VALUES) - eine Admin-Sperre schlägt ihn.
const PARTNER_STATUS_LABELS = {
  entwurf: 'Entwurf',
  aktiv: 'Aktiv',
  pausiert: 'Pausiert'
}

export function partnerStatusLabel(partner) {
  if (!partner) return null
  if (partner.gesperrt) return 'Gesperrt'
  return PARTNER_STATUS_LABELS[partner.status] || null
}
