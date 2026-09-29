import { FREIGABE_LABELS, freigabeKey } from '../lib/partnerPosts.js'

// Freigabe eines Beitrags durch den Admin (Phase P2): "Wartet auf Freigabe", "Freigegeben" oder
// "Abgelehnt" - beim Partner (PartnerPostRow) und im Admin (AdminPromotions) mit denselben Wörtern und
// Farben (partner-posts.css .freigabe-chip-*).
export default function FreigabeChip({ freigabe }) {
  const key = freigabeKey(freigabe)
  return <span className={`pill freigabe-chip freigabe-chip-${key}`}>{FREIGABE_LABELS[key]}</span>
}
