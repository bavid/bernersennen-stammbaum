import { useState } from 'react'
import { api } from '../../api'
import { useIsDemo, useReadOnlyHint } from '../../lib/demo.js'
import { formatVoucherCode, isCompleteVoucherCode } from '../../lib/voucherCode.js'

// "Ein anderes Zuhause besuchen" (Phase V2): den Code eines anderen Zuhauses einlösen (POST /api/besuche/einloesen).
// onRedeemed bekommt die Antwort { gastgeber, me } - der Aufrufer übernimmt "me" (neuer Eintrag im
// Bereichswechsler) und lädt die Liste neu.
export default function VisitRedeemForm({ onRedeemed }) {
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint('In der Demo lässt sich kein Code einlösen.')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await api.redeemVisit(code)
      setCode('')
      onRedeemed(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="visit-panel" aria-labelledby="visit-redeem-title">
      <h3 id="visit-redeem-title">Ein anderes Zuhause besuchen</h3>
      <p className="muted">
        Du hast einen Einladungs-Code bekommen? Gib ihn hier ein – danach findest du das Zuhause unter „Familien“ bei
        „Befreundete Zuhause“. Verbundene Zuhause sehen die Namen eurer Tiere, damit ihr euch gegenseitig bei
        „Mit dabei“ markieren könnt.
      </p>
      <form className="visit-redeem-form" onSubmit={handleSubmit}>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <label className="field-label" htmlFor="visit-redeem-code">
          Einladungs-Code
        </label>
        <div className="visit-redeem-row">
          <input
            id="visit-redeem-code"
            value={code}
            onChange={(event) => setCode(formatVoucherCode(event.target.value))}
            placeholder="XXXX-XXXX-XXXX"
            autoComplete="off"
            inputMode="text"
          />
          <button type="submit" className="btn btn-primary" disabled={busy || isDemo || !isCompleteVoucherCode(code)}>
            {busy ? 'Prüfe …' : 'Besuchen'}
          </button>
        </div>
        {isDemo && <p className="field-hint">{readOnlyHint}</p>}
      </form>
    </section>
  )
}
