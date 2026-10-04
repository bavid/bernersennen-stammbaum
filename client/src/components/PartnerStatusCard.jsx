import { useState } from 'react'
import { api } from '../api'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import { LOCKED_HINT, portalPath, profileStatusKey, profileStatusLabel } from '../lib/partnerProfile.js'
import Icon from './Icon.jsx'

const REASON_ID = 'partner-publish-reason'
const DEMO_HINT_ID = 'partner-publish-demo-hint'

// Ein Satz statt Checkliste (Wunsch 04.10.: „Status viel zu riesig“): fehlt = Pflicht fürs Veröffentlichen
// (server/lib/partnerProfile.js completeness), sonst der Portal-Link bzw. ein kurzer Zustand.
function StatusText({ profile, fehlt, isPublic }) {
  if (profile.gesperrt) {
    return (
      <p className="partner-status-locked">
        <Icon name="lock" />
        {LOCKED_HINT}
      </p>
    )
  }
  if (isPublic && profile.slug) {
    return (
      <p className="partner-status-portal">
        <a href={portalPath(profile.slug)} target="_blank" rel="noopener noreferrer">
          Euer Portal ansehen
        </a>
        <span className="muted">{portalPath(profile.slug)}</span>
      </p>
    )
  }
  if (fehlt.length > 0) {
    return (
      <p id={REASON_ID} className="partner-status-missing">
        Es fehlt noch: {fehlt.join(', ')}.
      </p>
    )
  }
  return <p className="partner-status-text">{profile.status === 'pausiert' ? 'Kunden sehen euer Portal gerade nicht.' : 'Alles da – bereit zum Veröffentlichen.'}</p>
}

// Veröffentlichen (nur mit vollständigem Profil) bzw. Pausieren; der Grund für die Sperre hängt per
// aria-describedby am Knopf.
function PublishButton({ profile, fehlt, busy, onPublish }) {
  const isDemo = useIsDemo()
  const isActive = profile.status === 'aktiv'
  const describedBy = [!isActive && fehlt.length > 0 && REASON_ID, isDemo && DEMO_HINT_ID].filter(Boolean).join(' ') || undefined

  if (isActive) {
    return (
      <button type="button" className="btn btn-ghost" disabled={isDemo || busy} aria-describedby={describedBy} onClick={() => onPublish(false)}>
        {busy ? 'Pausiere …' : 'Pausieren'}
      </button>
    )
  }
  return (
    <button
      type="button"
      className="btn btn-primary"
      disabled={isDemo || busy || fehlt.length > 0}
      aria-describedby={describedBy}
      onClick={() => onPublish(true)}
    >
      {busy ? 'Veröffentliche …' : 'Veröffentlichen'}
    </button>
  )
}

// Schmale Statusleiste oben auf /profil: Status, ein Satz (was fehlt bzw. Link zum Portal), höchstens ein
// empfohlener nächster Schritt und Veröffentlichen/Pausieren. Eine Sperre des Betreibers lässt nur den Hinweis
// stehen (der Server lehnt dann jedes Veröffentlichen/Pausieren mit 403 ab).
export default function PartnerStatusCard({ profile, onProfileChange }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const statusKey = profileStatusKey(profile)
  const fehlt = profile.vollstaendig?.fehlt || []
  const empfohlen = profile.vollstaendig?.empfohlen || []
  const isPublic = profile.status === 'aktiv' && !profile.gesperrt
  const nextStep = !profile.gesperrt && fehlt.length === 0 ? empfohlen[0] : null

  async function handlePublish(aktiv) {
    setBusy(true)
    setError(null)
    try {
      onProfileChange(await api.partnerArea.publish(aktiv))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={`partner-status-card is-${statusKey}`} aria-labelledby="partner-status-title">
      <h2 id="partner-status-title" className="visually-hidden">
        Status
      </h2>
      <span className={`pill partner-status-badge partner-status-${statusKey}`}>{profileStatusLabel(profile)}</span>
      <div className="partner-status-main">
        <StatusText profile={profile} fehlt={fehlt} isPublic={isPublic} />
        {nextStep && <p className="partner-status-next">Empfohlen: {nextStep}</p>}
        {isDemo && !profile.gesperrt && (
          <p id={DEMO_HINT_ID} className="visually-hidden">
            {readOnlyHint}
          </p>
        )}
      </div>
      {!profile.gesperrt && <PublishButton profile={profile} fehlt={fehlt} busy={busy} onPublish={handlePublish} />}
      {error && (
        <div className="error-banner partner-status-error" role="alert">
          {error}
        </div>
      )}
    </section>
  )
}
