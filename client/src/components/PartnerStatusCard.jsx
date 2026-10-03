import { useState } from 'react'
import { api } from '../api'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import { LOCKED_HINT, portalPath, profileStatusKey, profileStatusLabel } from '../lib/partnerProfile.js'
import Icon from './Icon.jsx'

const REASON_ID = 'partner-publish-reason'
const DEMO_HINT_ID = 'partner-publish-demo-hint'

// Checkliste aus vollstaendig (server/lib/partnerProfile.js completeness): fehlt = Pflicht fürs
// Veröffentlichen, empfohlen = macht das Portal besser, ist aber kein Muss.
function Checklist({ fehlt, empfohlen }) {
  return (
    <div className="partner-checklist">
      <h3 className="partner-checklist-title">Pflicht fürs Veröffentlichen</h3>
      {fehlt.length ? (
        <ul>
          {fehlt.map((item) => (
            <li key={item} className="is-missing">
              <Icon name="alert" />
              <span>{item}</span>
              <span className="partner-checklist-tag">fehlt</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="partner-checklist-done">
          <Icon name="check" />
          Alle Pflichtangaben sind da.
        </p>
      )}
      {empfohlen.length > 0 && (
        <>
          <h3 className="partner-checklist-title">Empfohlen</h3>
          <ul>
            {empfohlen.map((item) => (
              <li key={item} className="is-recommended">
                <Icon name="star" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

// Veröffentlichen (nur mit vollständigem Profil) bzw. Pausieren - der Grund, warum Veröffentlichen
// gesperrt ist, steht direkt darunter und hängt per aria-describedby am Knopf.
function PublishActions({ profile, fehlt, busy, onPublish }) {
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const isActive = profile.status === 'aktiv'
  const describedBy = [!isActive && fehlt.length > 0 && REASON_ID, isDemo && DEMO_HINT_ID].filter(Boolean).join(' ') || undefined

  return (
    <div className="partner-status-actions">
      {isActive ? (
        <button type="button" className="btn btn-ghost" disabled={isDemo || busy} aria-describedby={describedBy} onClick={() => onPublish(false)}>
          {busy ? 'Pausiere …' : 'Pausieren'}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-primary"
          disabled={isDemo || busy || fehlt.length > 0}
          aria-describedby={describedBy}
          onClick={() => onPublish(true)}
        >
          <Icon name="globe" />
          {busy ? 'Veröffentliche …' : 'Veröffentlichen'}
        </button>
      )}
      {/* Audit V7a: was fehlt, steht schon in der Checkliste darüber - sichtbar nur der Verweis, die Aufzählung bleibt für
          Screenreader am Knopf (aria-describedby). */}
      {!isActive && fehlt.length > 0 && (
        <p id={REASON_ID} className="field-hint">
          Erst die Pflichtangaben oben ergänzen.<span className="visually-hidden"> Es fehlt noch: {fehlt.join(', ')}.</span>
        </p>
      )}
      {isDemo && (
        <p id={DEMO_HINT_ID} className="field-hint">
          {readOnlyHint}
        </p>
      )}
    </div>
  )
}

// Statuskarte oben auf /profil: Status-Badge, Checkliste, Veröffentlichen/Pausieren und - sobald das
// Profil öffentlich ist - der Link zum Portal. Eine Sperre des Betreibers lässt nur den Hinweis stehen
// (der Server lehnt dann jedes Veröffentlichen/Pausieren mit 403 ab).
export default function PartnerStatusCard({ profile, onProfileChange }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const statusKey = profileStatusKey(profile)
  const fehlt = profile.vollstaendig?.fehlt || []
  const empfohlen = profile.vollstaendig?.empfohlen || []
  const isPublic = profile.status === 'aktiv' && !profile.gesperrt

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
    <section className={`card partner-status-card is-${statusKey}`} aria-labelledby="partner-status-title">
      <div className="partner-status-head">
        <h2 id="partner-status-title">Status</h2>
        <span className={`pill partner-status-badge partner-status-${statusKey}`}>{profileStatusLabel(profile)}</span>
      </div>

      <Checklist fehlt={fehlt} empfohlen={empfohlen} />

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {profile.gesperrt ? (
        <p className="partner-status-locked">
          <Icon name="lock" />
          {LOCKED_HINT}
        </p>
      ) : (
        <PublishActions profile={profile} fehlt={fehlt} busy={busy} onPublish={handlePublish} />
      )}

      {isPublic && profile.slug && (
        <p className="partner-status-portal">
          <a className="btn btn-ghost" href={portalPath(profile.slug)} target="_blank" rel="noopener noreferrer">
            <Icon name="external" />
            Euer Portal ansehen
          </a>
          <span className="muted">{portalPath(profile.slug)}</span>
        </p>
      )}
    </section>
  )
}
