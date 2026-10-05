import { useState } from 'react'
import { api } from '../api'
import Icon from './Icon.jsx'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import { useToast } from './Toast.jsx'

export const UEBERALL_LABEL = 'Überall sichtbar (vorerst kostenlos)'
export const UEBERALL_HINT = 'Euer Portal erscheint in „Entdecken“ nicht nur in der Nähe, sondern bei allen – hinter den nahen Treffern, klar als „überall sichtbar“ gekennzeichnet.'
// Wie server/lib/ueberallSichtbar.js GESPERRT_MESSAGE.
export const TEAM_AUS_HINT = 'Diese Hervorhebung wurde vom Team ausgeschaltet – bitte meldet euch bei uns.'

const HINT_ID = 'partner-ueberall-hint'
const DEMO_HINT_ID = 'partner-ueberall-demo-hint'

// Phase F: der Schalter „Überall sichtbar (vorerst kostenlos)“ im Reiter „Teilen“ des Partner-Profils
// (PUT /api/partner-area/profile/ueberall-sichtbar, server/lib/ueberallSichtbar.js). Ein Klick speichert sofort; die Antwort
// ist das ganze Profil (onSaved). In der Demo, bei einer Sperre des Profils und wenn das Team die Hervorhebung ausgeschaltet
// hat (ueberallGesperrt) gesperrt, jeweils mit Hinweis. Wirkt nur, solange das Profil öffentlich ist - das sagt die Zeile
// darunter.
export default function PartnerUeberallSwitch({ profile, onSaved }) {
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const an = Boolean(profile.ueberallSichtbar)
  const locked = Boolean(profile.gesperrt)
  const teamAus = Boolean(profile.ueberallGesperrt)
  const disabled = isDemo || locked || teamAus || busy

  async function toggle() {
    setError(null)
    setBusy(true)
    try {
      const saved = await api.partnerArea.setUeberallSichtbar(!an)
      onSaved(saved)
      toast(an ? 'Ausgeschaltet – ihr erscheint wieder nur in der Nähe.' : 'Eingeschaltet – ihr erscheint überall in „Entdecken“.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card partner-ueberall" aria-labelledby="partner-ueberall-title">
      <div className="partner-ueberall-head">
        <Icon name="compass" />
        <div>
          <h2 id="partner-ueberall-title">Überall sichtbar</h2>
          <p className="muted" id={HINT_ID}>
            {UEBERALL_HINT}
          </p>
        </div>
      </div>
      <label className="check partner-ueberall-switch">
        <input
          type="checkbox"
          role="switch"
          checked={an}
          disabled={disabled}
          onChange={toggle}
          aria-describedby={isDemo ? `${HINT_ID} ${DEMO_HINT_ID}` : HINT_ID}
        />
        {UEBERALL_LABEL}
      </label>
      {teamAus && (
        <p className="field-hint" role="note">
          {TEAM_AUS_HINT}
        </p>
      )}
      {profile.status !== 'aktiv' && !locked && !teamAus && (
        <p className="field-hint">Gilt, sobald euer Profil veröffentlicht ist.</p>
      )}
      {locked && <p className="field-hint">Gesperrt – bitte meldet euch beim Betreiber.</p>}
      {isDemo && (
        <p className="field-hint" id={DEMO_HINT_ID}>
          {readOnlyHint}
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
