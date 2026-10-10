import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import PromotionCard from './PromotionCard.jsx'
import FreigabeChip from './FreigabeChip.jsx'
import AdminRejectForm from './AdminRejectForm.jsx'
import AdminApprovalVerlauf from './AdminApprovalVerlauf.jsx'
import { BEREICH_LABELS, formatZeitraum } from '../lib/adminMarketing.js'
import { PreviewProvider } from '../lib/preview.js'
import { promotionPreviewCard } from '../lib/adminApproval.js'
import { relativeTime, todayIso } from '../lib/dates.js'
import { formatZeitraeume } from '../lib/zeitraeume.js'
import { verlaufDateTime } from '../lib/freigabeVerlauf.js'
import { Button } from './ui/index.js'

// Ein Beitrag in "Zur Freigabe" (AdminPostApproval): von welchem Partner, eine Vorschau genau so, wie Kundinnen und
// Kunden ihn sähen (PromotionCard, Link deaktiviert), der Verlauf zum Aufklappen und die Entscheidung direkt hier.
// mode 'eingereicht': Auswahl für die Sammel-Freigabe (onSelect), "Freigeben" und "Ablehnen …" (Vorlage + Zusatz,
// AdminRejectForm). mode 'entschieden' (V-Fehler 3): Ergebnis, Zeitpunkt und Grund - und die Gegen-Entscheidung
// ("Doch freigeben" bzw. "Ablehnen …"), falls sich der Admin umentscheidet. refreshKey: ändert sich bei jedem Laden der
// Liste - der Verlauf wird dann neu geholt (der Partner kann den Beitrag inzwischen geändert haben).
export default function AdminPostApprovalItem({
  promotion,
  busy,
  mode = 'eingereicht',
  selected = false,
  refreshKey = 0,
  onSelect,
  onApprove,
  onReject
}) {
  const [rejecting, setRejecting] = useState(false)
  const rejectButtonRef = useRef(null)
  const returnFocus = useRef(false)
  const decided = mode === 'entschieden'
  const canApprove = !decided || promotion.freigabe === 'abgelehnt'
  const canReject = !decided || promotion.freigabe === 'freigegeben'

  // "Abbrechen" schließt das Formular - der Fokus kehrt auf "Ablehnen …" zurück (nach einer Entscheidung setzt ihn
  // AdminPostApproval auf die Überschrift).
  useEffect(() => {
    if (rejecting || !returnFocus.current) return
    returnFocus.current = false
    rejectButtonRef.current?.focus()
  }, [rejecting])

  function cancelReject() {
    returnFocus.current = true
    setRejecting(false)
  }

  async function handleReject(reason) {
    const done = await onReject(promotion, reason)
    if (done) setRejecting(false)
  }

  return (
    <li className={`admin-approval-item${selected ? ' is-selected' : ''}`}>
      <div className="admin-approval-meta">
        {!decided && onSelect && (
          <label className="check admin-approval-select">
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onSelect(promotion, e.target.checked)}
              aria-label={`„${promotion.titel}“ auswählen`}
            />
            Auswählen
          </label>
        )}
        <p className="admin-approval-partner">
          <Icon name="megaphone" />
          <span>
            von Partner <strong>{promotion.partnerName || 'unbekannt'}</strong>
          </span>
        </p>
        <p className="muted">
          {BEREICH_LABELS[promotion.bereich] || promotion.bereich} · {formatZeitraum(promotion.start, promotion.ende)} ·{' '}
          {promotion.aktiv ? 'aktiv' : 'inaktiv'}
          {promotion.url && (
            <>
              {' '}
              · Link: <span className="admin-approval-url">{promotion.url}</span>
            </>
          )}
        </p>
        {/* Phase V4a: alle Termine der Anzeige, auch vergangene - die Vorschau unten zeigt nur die kommenden. */}
        {promotion.zeitraeume?.length > 0 && (
          <p className="muted admin-approval-termine">Termine: {formatZeitraeume(promotion.zeitraeume, todayIso(), { includePast: true })}</p>
        )}
        {decided && (
          <p className="admin-approval-decision">
            <FreigabeChip freigabe={promotion.freigabe} />
            {promotion.entschiedenAt && (
              <time dateTime={verlaufDateTime(promotion.entschiedenAt)}>{relativeTime(promotion.entschiedenAt)}</time>
            )}
          </p>
        )}
        {decided && promotion.freigabe === 'abgelehnt' && promotion.ablehnungsgrund && (
          <p className="admin-promo-reason">Grund: {promotion.ablehnungsgrund}</p>
        )}
        <AdminApprovalVerlauf key={`${promotion.id}-${promotion.freigabe}-${refreshKey}`} promotionId={promotion.id} />
      </div>

      {/* Vorschau: PreviewProvider schaltet den Link ab - der Admin soll prüfen, nicht klicken (und nicht zählen). */}
      <PreviewProvider value>
        <div className="admin-approval-preview">
          <PromotionCard promotion={promotionPreviewCard(promotion)} />
        </div>
      </PreviewProvider>

      {rejecting ? (
        <AdminRejectForm promotionId={promotion.id} busy={busy} onSubmit={handleReject} onCancel={cancelReject} />
      ) : (
        <div className="admin-row-actions">
          {canApprove && (
            <Button type="button" onClick={() => onApprove(promotion)} disabled={busy}>
              <Icon name="check" /> {decided ? 'Doch freigeben' : 'Freigeben'}
            </Button>
          )}
          {canReject && (
            <button ref={rejectButtonRef} type="button" className="btn btn-ghost" onClick={() => setRejecting(true)} disabled={busy}>
              Ablehnen …
            </button>
          )}
        </div>
      )}
    </li>
  )
}
