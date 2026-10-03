import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import Icon from './Icon.jsx'
import AdminServerCards from './AdminServerCards.jsx'
import AdminServerVerlauf from './AdminServerVerlauf.jsx'
import { ampelSummary, formatTime } from '../lib/adminServer.js'

// Hinweis unter den Karten: gehen Warnungen per Telegram raus?
function warnNote(warnungen) {
  if (!warnungen?.aktiv) return 'Warnungen per Telegram: aus (Reiter „Einstellungen“, Schalter „Server-Warnungen“).'
  if (!warnungen.eingerichtet) return 'Warnungen per Telegram: Telegram ist noch nicht eingerichtet (Reiter „Einstellungen“).'
  return 'Warnungen per Telegram: an (höchstens eine je Messwert und Tag).'
}

function Summary({ status }) {
  const { stufe, text } = ampelSummary(status)
  return (
    <p className={`admin-server-summary is-${stufe ?? 'leer'}`}>
      <span className="server-ampel-dot" aria-hidden="true" />
      {text}
    </p>
  )
}

// Reiter „Server“ im Admin (Phase G Task 6, server/routes/adminServer.js): Arbeitsspeicher, Speicherplatz und Last mit
// Ampel, Größen, Laufzeit, Stand und der Verlauf der letzten 30 Tage. Lädt beim Öffnen des Reiters (active - der Reiter
// bleibt nach dem ersten Öffnen eingehängt, darum bei jeder Rückkehr neu) und auf „Aktualisieren“; die Ordnergrößen
// rechnet der Server ohnehin nur stündlich neu. Der Knopf bleibt fokussierbar (aria-disabled statt disabled), damit der
// Fokus beim Laden nicht verloren geht. Nach einem Fehler bleiben die letzten Werte stehen.
export default function AdminServer({ active = true }) {
  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(active)
  const alive = useRef(true)
  const busy = useRef(false)

  const load = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setLoading(true)
    try {
      const data = await api.admin.server()
      if (!alive.current) return
      setStatus(data)
      setError(null)
    } catch (err) {
      if (alive.current) setError(err.message)
    } finally {
      busy.current = false
      if (alive.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    if (active) load()
  }, [active, load])

  return (
    <section className="admin-server card" aria-labelledby="admin-server-title" aria-busy={loading}>
      <div className="admin-section-head">
        <div>
          <h2 id="admin-server-title">Server</h2>
          <p className="muted">
            Speicher, Platte und Last des ganzen Servers mit Ampel nach den Warnschwellen. Prod und Vorschau teilen sich den
            Server und zeigen dieselben Werte.
          </p>
        </div>
        <div className="admin-server-actions">
          {status && <span className="admin-server-time muted">Zuletzt gemessen: {formatTime(status.gemessenAt)}</span>}
          <button type="button" className="btn btn-ghost admin-server-refresh" onClick={load} aria-disabled={loading}>
            <Icon name="rotate" />
            {loading ? 'Aktualisiere …' : 'Aktualisieren'}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {/* Immer im DOM, damit auch das erste Ergebnis vorgelesen wird. */}
      <div role="status" className="admin-server-live">
        {status ? <Summary status={status} /> : loading && <p className="muted">Lade …</p>}
      </div>
      {status && (
        <>
          <AdminServerCards status={status} />
          <AdminServerVerlauf status={status} />
          <p className="admin-server-warn-note muted">{warnNote(status.warnungen)}</p>
        </>
      )}
    </section>
  )
}
