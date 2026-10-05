import { useState } from 'react'
import { api } from '../api'
import Icon from './Icon.jsx'

// Phase F: „Überall sichtbar“ in der Partnerliste des Admins (partners.ueberall_sichtbar / ueberall_gesperrt). Der Partner
// schaltet es selbst ein (PartnerUeberallSwitch). Hier steht es nur in zwei Fällen: an -> Chip „Überall sichtbar“ mit
// „Ausschalten“ (schaltet aus UND sperrt, der Partner kann nicht wieder einschalten); vom Team ausgeschaltet -> Chip
// „vom Team ausgeschaltet“ mit „Wieder erlauben“ (hebt die Sperre auf, einschalten tut der Partner). Aus und nicht gesperrt:
// nichts - ruhig bleiben. PUT /api/admin/partners/:id/ueberall-sichtbar { erlaubt }, protokolliert.
export default function AdminPartnerUeberall({ partner, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const gesperrt = Boolean(partner.ueberall_gesperrt)
  const an = Boolean(partner.ueberall_sichtbar)
  if (!an && !gesperrt) return null

  async function setErlaubt(erlaubt) {
    setError(null)
    setBusy(true)
    try {
      await api.admin.setPartnerUeberallErlaubt(partner.id, erlaubt)
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-partner-ueberall">
      <span className={`pill admin-partner-ueberall-pill${gesperrt ? ' is-gesperrt' : ''}`}>
        <Icon name={gesperrt ? 'lock' : 'compass'} />
        {gesperrt ? 'Überall sichtbar: vom Team ausgeschaltet' : 'Überall sichtbar'}
      </span>
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setErlaubt(gesperrt)}>
        {gesperrt ? 'Wieder erlauben' : 'Ausschalten'}
        <span className="visually-hidden">: Überall sichtbar für {partner.name}</span>
      </button>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
