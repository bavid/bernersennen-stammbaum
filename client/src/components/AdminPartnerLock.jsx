import { useState } from 'react'
import { api } from '../api'
import Icon from './Icon.jsx'
import { rowPayload } from '../lib/adminPartnerForm.js'

export const LOCK_WARNING = 'Das Profil verschwindet sofort aus allen öffentlichen Listen.'

// Admin-Sperre eines Partners (Phase P1, partners.gesperrt): "Sperren" fragt einmal nach (das Profil ist
// sofort nirgends mehr öffentlich, der Server setzt den Status dabei auf pausiert), "Entsperren" nicht -
// danach bleibt der Partner pausiert, bis ihn jemand wieder aktiviert. Wie Pausieren schickt es den vollen
// Datensatz (lib/adminPartnerForm.js rowPayload), nur mit gesperrt.
export default function AdminPartnerLock({ partner, onChanged }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function save(gesperrt) {
    setError(null)
    setBusy(true)
    try {
      await api.admin.updatePartner(partner.id, rowPayload(partner, { gesperrt }))
      setConfirming(false)
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const errorMessage = error && (
    <span className="field-error" role="alert">
      {error}
    </span>
  )

  if (partner.gesperrt) {
    return (
      <>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => save(false)}>
          <Icon name="lock" />
          {busy ? 'Entsperre …' : 'Entsperren'}
        </button>
        {errorMessage}
      </>
    )
  }

  if (!confirming) {
    return (
      <button type="button" className="btn btn-ghost admin-partner-lock" onClick={() => setConfirming(true)}>
        <Icon name="lock" />
        Sperren
      </button>
    )
  }

  return (
    <span className="admin-partner-confirm">
      <span className="field-hint" role="alert">
        {LOCK_WARNING}
      </span>
      <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>
        Abbrechen
      </button>
      <button type="button" className="btn btn-danger" disabled={busy} onClick={() => save(true)}>
        {busy ? 'Sperre …' : 'Wirklich sperren?'}
      </button>
      {errorMessage}
    </span>
  )
}
