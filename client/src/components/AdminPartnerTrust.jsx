import { useState } from 'react'
import { api } from '../api'
import { rowPayload } from '../lib/adminPartnerForm.js'

export const TRUST_HINT = 'Änderungen an schon freigegebenen Beiträgen gehen ohne neue Prüfung online. Neue Beiträge prüfst du weiterhin.'

// Schalter "Vertrauenswürdig" eines Partners (V-Fehler 3, partners.vertrauenswuerdig): an, gehen Änderungen an
// freigegebenen Beiträgen sofort online (server/lib/promotionFreigabe.js partnerEditOutcome) - neue Beiträge brauchen
// weiter die Freigabe. Wie Sperren schickt er den vollen Datensatz (lib/adminPartnerForm.js rowPayload), nur mit
// vertrauenswuerdig; der Server protokolliert die Änderung.
export default function AdminPartnerTrust({ partner, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const hintId = `admin-partner-trust-hint-${partner.id}`
  const trusted = Boolean(partner.vertrauenswuerdig)

  async function toggle() {
    setError(null)
    setBusy(true)
    try {
      await api.admin.updatePartner(partner.id, rowPayload(partner, { vertrauenswuerdig: !trusted }))
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-partner-trust">
      <label className="check admin-partner-trust-switch">
        <input type="checkbox" role="switch" checked={trusted} disabled={busy} onChange={toggle} aria-describedby={hintId} />
        Vertrauenswürdig
      </label>
      {/* Sichtbar steht die Erklärung einmal über der Liste (AdminPartners) - hier nur für Screenreader. */}
      <p className="visually-hidden" id={hintId}>
        {TRUST_HINT}
      </p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
