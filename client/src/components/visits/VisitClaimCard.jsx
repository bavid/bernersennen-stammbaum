import { useState } from 'react'
import { api } from '../../api'

// /v#CODE mit laufender Sitzung im eigenen Zuhause (Phase V2): der Code ist eine Besuchs-Einladung - statt
// "Abmelden und einlösen" gleich verbinden (POST /api/besuche/einloesen). visit: { name } aus api.checkVoucher.
// onConnected bekommt das neue "me" (mit dem Gastgeber in me.besuche).
export default function VisitClaimCard({ code, visit, onConnected }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleConnect() {
    setBusy(true)
    setError(null)
    try {
      const { me } = await api.redeemVisit(code)
      onConnected(me)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="card voucher-session-card">
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <p>
        „{visit.name}“ lädt euch zu Besuch ein: Ihr seht dort die Tiere und alle nicht-privaten Einträge und dürft
        kommentieren. Verbunden sehen beide Zuhause die Namen der Tiere des anderen (für „Erlebt mit“).
      </p>
      <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={handleConnect}>
        {busy ? 'Verbinde …' : `Bei „${visit.name}“ vorbeischauen`}
      </button>
    </div>
  )
}
