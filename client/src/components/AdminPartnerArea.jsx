import { useState } from 'react'
import { api } from '../api'
import { Button } from './ui/index.js'

// Beschriftung je Bereichsart (families.art, server/lib/partnerAreas.js areaArtForTyp).
const AREA_LABELS = { tierheim: 'Tierheim-Bereich', partner: 'Partner-Bereich' }

// Bereich eines Partners (Phase P1: jeder Typ, nicht nur Tierheime): ohne Bereich ein einfacher
// "anlegen"-Knopf (der Server legt Bereich und Schlüssel in einem Zug an, nichts geht verloren - darum
// ohne Rückfrage). Mit Bereich "Schlüssel neu ausgeben" mit Bestätigung und Erklärtext, weil das alle
// laufenden Sitzungen des Teams beendet. Der neue Schlüssel geht über onKeyIssued an AdminPartners,
// das ihn einmalig per KeyReveal zeigt; onChanged lädt die Liste neu.
export default function AdminPartnerArea({ partner, onKeyIssued, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState(null)
  const hasArea = Boolean(partner.area_family_id)

  async function issueKey(request) {
    setError(null)
    setBusy(true)
    try {
      const { key } = await request(partner.id)
      setConfirming(false)
      onKeyIssued(key, partner)
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function startRenew() {
    setError(null)
    setConfirming(true)
  }

  return (
    <span className="admin-partner-area">
      {hasArea ? (
        <>
          <span className="pill">{AREA_LABELS[partner.area_art] || 'Bereich'}: angelegt</span>
          {confirming ? (
            <span className="admin-partner-confirm">
              <span className="field-hint" role="alert">
                Alle Geräte des Partners müssen sich neu anmelden.
              </span>
              <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
                Abbrechen
              </Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => issueKey(api.admin.renewPartnerAreaKey)}>
                {busy ? 'Erneuere …' : 'Wirklich neu ausgeben?'}
              </Button>
            </span>
          ) : (
            <Button type="button" variant="ghost" onClick={startRenew}>
              Schlüssel neu ausgeben
            </Button>
          )}
        </>
      ) : (
        <Button type="button" variant="ghost" disabled={busy} onClick={() => issueKey(api.admin.createPartnerArea)}>
          {busy ? 'Lege an …' : 'Partner-Bereich anlegen'}
        </Button>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </span>
  )
}
