// Vermittlungsstatus eines Tiers (Tierheim) - die EINE Stelle für Werte und Beschriftungen, geteilt von
// ShelterAnimalsPage (Karten, Filter-Chips), VermittlungStatusPanel, SteckbriefPanel, AnimalAdoptionCard
// und SteckbriefPage. Werte spiegeln server/lib/vermittlung.js (VERMITTLUNG_STATUS, PUBLISHABLE_STATUS).

// Reihenfolge = Anzeige-Reihenfolge (Auswahl im Status-Panel, Filter-Chips).
export const VERMITTLUNG_STATUS_VALUES = ['in_vermittlung', 'reserviert', 'pausiert', 'vermittelt']

// "pausiert" (on hold): vorübergehend nicht vermittelbar - der Steckbrief bleibt öffentlich, das Tier
// erscheint aber nicht in "Entdecken". short (optional): kürzere Beschriftung für die Filter-Chips.
const STATUS_LABELS = {
  in_vermittlung: { label: 'Verfügbar' },
  reserviert: { label: 'Reserviert' },
  // Audit V7a: ohne "(on hold)" - Fachwort auf Englisch; was es heißt, sagt PAUSED_HINT bzw. das Status-Panel.
  pausiert: { label: 'Pausiert' },
  vermittelt: { label: 'Vermittelt' }
}

export const NO_STATUS_LABEL = '– kein Status –'

// Hinweis auf dem öffentlichen Steckbrief eines pausierten Tiers.
export const PAUSED_HINT = 'Gerade nicht vermittelbar – schaut bald wieder vorbei.'

export function vermittlungStatusLabel(status) {
  return STATUS_LABELS[status]?.label || null
}

export function vermittlungStatusShortLabel(status) {
  const entry = STATUS_LABELS[status]
  return entry ? entry.short || entry.label : null
}

// Ein Steckbrief lässt sich veröffentlichen (und bleibt veröffentlicht), solange das Tier noch
// vermittelbar ist - "pausiert" zählt dazu, erst "vermittelt" oder kein Status ziehen ihn zurück.
export const STECKBRIEF_PUBLISHABLE_STATUS = ['in_vermittlung', 'reserviert', 'pausiert']
