import { ZWECK_PARTNERZUGANG } from './AdminVoucherForm.jsx'
import { TYPE_LABELS } from '../lib/partnerTypes.js'

// Zweck eines Gutschein-Stapels als Badge, geteilt zwischen der Stapel-Liste (AdminVouchers) und der
// Statistik (AdminStatsStapel): Partner-Zugang (mit Typ-Vorgabe, falls gesetzt) oder Kunden-Gutscheine
// (auch ältere Stapel ohne zweck). Phase V2: Besuchs-Einladungen eines Zuhauses (zweck 'besuch', 7 Tage gültig).
export default function ZweckBadge({ batch }) {
  if (batch.zweck === 'besuch') return <span className="pill admin-voucher-zweck-badge">Besuchs-Einladung</span>
  if (batch.zweck !== ZWECK_PARTNERZUGANG) return <span className="pill admin-voucher-zweck-badge">Kunden-Gutscheine</span>
  const typ = batch.partnerTyp ? ` · ${TYPE_LABELS[batch.partnerTyp] || batch.partnerTyp}` : ''
  return <span className="pill admin-voucher-zweck-badge is-access">Partner-Zugang{typ}</span>
}
