import { useState } from 'react'
import { api } from '../api'
import Icon from './Icon.jsx'

// Phase F: „Überall sichtbar“ in der Partnerliste des Admins (partners.ueberall_sichtbar). Der Partner schaltet es selbst
// ein (PartnerUeberallSwitch) - hier steht es nur, wenn es an ist, mit einem Knopf zum Ausschalten
// (PUT /api/admin/partners/:id/ueberall-sichtbar, protokolliert). Ist es aus, steht hier nichts - ruhig bleiben.
export default function AdminPartnerUeberall({ partner, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  if (!partner.ueberall_sichtbar) return null

  async function turnOff() {
    setError(null)
    setBusy(true)
    try {
      await api.admin.setPartnerUeberallSichtbar(partner.id, false)
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-partner-ueberall">
      <span className="pill admin-partner-ueberall-pill">
        <Icon name="compass" />
        Überall sichtbar
      </span>
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={turnOff}>
        Ausschalten
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
