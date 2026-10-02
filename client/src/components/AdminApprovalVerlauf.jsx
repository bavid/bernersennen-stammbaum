import { useState } from 'react'
import { api } from '../api'
import Icon from './Icon.jsx'
import FreigabeVerlauf from './FreigabeVerlauf.jsx'

// "Verlauf" je Beitrag in "Zur Freigabe" (V-Fehler 3): aufklappen lädt ihn einmal (GET
// /api/admin/promotions/:id/verlauf, bis zu 50 Einträge) - danach nur noch auf- und zuklappen. Ändert sich der
// Beitrag, mountet AdminPostApprovalItem diese Komponente neu (key mit der Freigabe).
export default function AdminApprovalVerlauf({ promotionId }) {
  const [open, setOpen] = useState(false)
  const [verlauf, setVerlauf] = useState(undefined)
  const [error, setError] = useState(null)
  const panelId = `admin-approval-verlauf-${promotionId}`

  async function toggle() {
    const next = !open
    setOpen(next)
    if (!next || verlauf !== undefined) return
    setError(null)
    try {
      const events = await api.admin.promotionVerlauf(promotionId)
      setVerlauf(Array.isArray(events) ? events : [])
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="admin-approval-verlauf">
      <button type="button" className="btn btn-ghost admin-approval-verlauf-toggle" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
        <Icon name="clock" />
        Verlauf
      </button>
      {/* Der Bereich steht immer im DOM (aria-controls zeigt so nie ins Leere), sein Inhalt nur aufgeklappt. */}
      <div id={panelId} className="admin-approval-verlauf-panel" hidden={!open}>
        {open && error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        {open && !error && verlauf === undefined && <p className="muted">Lade …</p>}
        {open && verlauf && <FreigabeVerlauf verlauf={verlauf} />}
      </div>
    </div>
  )
}
