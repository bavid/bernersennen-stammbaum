import Icon from './Icon.jsx'
import { FREIGABE_LABELS, freigabeKey } from '../lib/partnerPosts.js'

// Symbol je Freigabe (V-Fehler 3) - der Zustand ist so auch ohne Farbe zu erkennen.
const FREIGABE_ICONS = Object.freeze({ eingereicht: 'clock', freigegeben: 'check', abgelehnt: 'alert' })

// Freigabe eines Beitrags durch den Admin (Phase P2): "Wartet auf Freigabe", "Freigegeben" oder
// "Abgelehnt" - beim Partner (PartnerPostRow) und im Admin (AdminPromotions, AdminPostApprovalItem) mit denselben
// Wörtern, Symbolen und Farben (partner-posts.css .freigabe-chip-*).
export default function FreigabeChip({ freigabe }) {
  const key = freigabeKey(freigabe)
  return (
    <span className={`pill freigabe-chip freigabe-chip-${key}`}>
      <Icon name={FREIGABE_ICONS[key]} />
      {FREIGABE_LABELS[key]}
    </span>
  )
}
