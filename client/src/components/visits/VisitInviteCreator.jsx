import { useState } from 'react'
import { api } from '../../api'
import CopyField from '../CopyField.jsx'
import Icon from '../Icon.jsx'
import { useIsDemo, useReadOnlyHint } from '../../lib/demo.js'
import { formatDateShort } from '../../lib/dates.js'
import { voucherLink } from '../../lib/visits.js'

// "Jemanden in mein Zuhause einladen" (Phase V2): ein neuer Besuchs-Code, 7 Tage gültig und einmal einlösbar
// (server/routes/besuche.js POST /einladungen). Code und Link stehen nur hier und - solange offen - in der Liste
// der eigenen Codes darunter. onCreated: die Liste dort neu laden.
export default function VisitInviteCreator({ onCreated }) {
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint('In der Demo werden keine Einladungen vergeben.')
  const [invite, setInvite] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleCreate() {
    setBusy(true)
    setError(null)
    try {
      const created = await api.createVisitInvite()
      setInvite(created)
      onCreated?.(created)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="visit-panel" aria-labelledby="visit-invite-title">
      <h3 id="visit-invite-title">Jemanden in mein Zuhause einladen</h3>
      <p className="muted">
        Wer den Code einlöst, sieht eure Tiere und alle nicht-privaten Einträge und darf kommentieren – ändern kann er
        nichts. Der Code gilt 7 Tage und nur einmal; beenden könnt ihr den Besuch jederzeit. Verbunden könnt ihr euch
        gegenseitig bei „Erlebt mit“ markieren.
      </p>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {invite ? (
        <div className="visit-invite-result">
          <CopyField
            id="visit-invite-code"
            label="Einladungs-Code"
            value={invite.code}
            hint={`Gültig bis ${formatDateShort(invite.expires_at)} – danach verfällt er.`}
          />
          <CopyField id="visit-invite-link" label="Link zum Weitergeben" value={voucherLink(invite.code)} />
        </div>
      ) : (
        <div className="visit-actions">
          <button type="button" className="btn btn-primary" onClick={handleCreate} disabled={busy || isDemo}>
            <Icon name="plus" />
            {busy ? 'Erstelle …' : 'Besuchs-Einladung erstellen'}
          </button>
        </div>
      )}
      {isDemo && <p className="field-hint">{readOnlyHint}</p>}
    </section>
  )
}
