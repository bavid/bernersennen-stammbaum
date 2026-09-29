import { useRef, useState } from 'react'
import Icon from './Icon.jsx'
import PromotionCard from './PromotionCard.jsx'
import { BEREICH_LABELS, formatZeitraum } from '../lib/adminMarketing.js'
import { PreviewProvider } from '../lib/preview.js'
import { MAX_GRUND_LENGTH, MIN_GRUND_LENGTH, grundError, promotionPreviewCard } from '../lib/adminApproval.js'

// Ein eingereichter Beitrag in "Zur Freigabe" (AdminPostApproval): von welchem Partner, eine Vorschau
// genau so, wie Kundinnen und Kunden ihn sähen (PromotionCard, Link deaktiviert), dazu "Freigeben" und
// "Ablehnen" - Ablehnen fragt nach dem Grund (3-300 Zeichen), den der Partner in seiner Liste sieht.
export default function AdminPostApprovalItem({ promotion, busy, onApprove, onReject }) {
  const [rejecting, setRejecting] = useState(false)
  const [grund, setGrund] = useState('')
  const [error, setError] = useState(null)
  const grundRef = useRef(null)
  const grundId = `admin-reject-grund-${promotion.id}`

  async function handleReject(event) {
    event.preventDefault()
    const message = grundError(grund)
    setError(message)
    if (message) {
      grundRef.current?.focus()
      return
    }
    const done = await onReject(promotion, grund.trim())
    if (done) setRejecting(false)
  }

  return (
    <li className="admin-approval-item">
      <div className="admin-approval-meta">
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
      </div>

      {/* Vorschau: PreviewProvider schaltet den Link ab - der Admin soll prüfen, nicht klicken (und nicht zählen). */}
      <PreviewProvider value>
        <div className="admin-approval-preview">
          <PromotionCard promotion={promotionPreviewCard(promotion)} />
        </div>
      </PreviewProvider>

      {rejecting ? (
        <form className="admin-approval-reject form-stack" onSubmit={handleReject} noValidate>
          <div className="field">
            <label className="field-label" htmlFor={grundId}>
              Grund für die Ablehnung
            </label>
            <textarea
              ref={grundRef}
              id={grundId}
              value={grund}
              onChange={(e) => {
                setGrund(e.target.value)
                setError(null)
              }}
              maxLength={MAX_GRUND_LENGTH}
              rows={3}
              aria-invalid={error ? true : undefined}
              aria-describedby={`${grundId}-hint${error ? ` ${grundId}-error` : ''}`}
            />
            <p className="field-hint" id={`${grundId}-hint`}>
              {MIN_GRUND_LENGTH}–{MAX_GRUND_LENGTH} Zeichen – der Partner sieht den Grund bei seinem Beitrag.
            </p>
            {error && (
              <p className="field-error" id={`${grundId}-error`} role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setRejecting(false)}>
              Abbrechen
            </button>
            <button type="submit" className="btn btn-danger" disabled={busy}>
              Ablehnen
            </button>
          </div>
        </form>
      ) : (
        <div className="admin-row-actions">
          <button type="button" className="btn btn-primary" onClick={() => onApprove(promotion)} disabled={busy}>
            <Icon name="check" /> Freigeben
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setRejecting(true)} disabled={busy}>
            Ablehnen …
          </button>
        </div>
      )}
    </li>
  )
}
