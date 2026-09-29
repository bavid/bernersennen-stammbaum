import { useEffect, useState } from 'react'
import { api } from '../api'
import { useIsDemo } from '../lib/demo.js'
import { MAX_EINBLICKE, sortEinblicke } from '../lib/einblicke.js'
import { DEMO_HINT } from '../lib/partnerProfile.js'
import EinblickCard from './EinblickCard.jsx'
import EinblickForm from './EinblickForm.jsx'

const DEMO_HINT_ID = 'einblicke-demo-hint'

// Reiter "Einblicke" auf /profil (Phase P): Fotos mit Datum, die auf dem Portal erscheinen - oben das
// Formular "Neuer Einblick", darunter das Raster der vorhandenen (neueste zuerst). Höchstens
// MAX_EINBLICKE; onChanged meldet Anlegen/Löschen, damit die Statuskarte ihre Empfehlung
// "mindestens ein Einblick" auffrischt.
export default function EinblickeEditor({ onChanged }) {
  const isDemo = useIsDemo()
  const [einblicke, setEinblicke] = useState(undefined)
  const [loadError, setLoadError] = useState(null)
  const count = einblicke?.length ?? 0

  useEffect(() => {
    let cancelled = false
    api.partnerArea
      .einblicke()
      .then((list) => {
        if (!cancelled) setEinblicke(sortEinblicke(list))
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function handleCreated(einblick) {
    setEinblicke((list) => sortEinblicke([einblick, ...(list || [])]))
    onChanged?.()
  }

  function handleUpdated(einblick) {
    setEinblicke((list) => sortEinblicke(list.map((item) => (item.id === einblick.id ? einblick : item))))
  }

  function handleDeleted(id) {
    setEinblicke((list) => list.filter((item) => item.id !== id))
    onChanged?.()
  }

  return (
    <section className="einblicke-editor" aria-labelledby="einblicke-title">
      <div className="einblicke-head">
        <div>
          <h2 id="einblicke-title">Einblicke</h2>
          <p className="muted">Fotos aus eurem Alltag – sie erscheinen mit Datum auf eurem Portal.</p>
        </div>
        <span className="pill einblicke-count" aria-live="polite">
          {count} von {MAX_EINBLICKE}
        </span>
      </div>

      <EinblickForm isFull={count >= MAX_EINBLICKE} onCreated={handleCreated} />

      {loadError && (
        <div className="error-banner" role="alert">
          {loadError}
        </div>
      )}
      {einblicke === undefined && !loadError && <p className="muted">Lade …</p>}
      {einblicke?.length === 0 && <p className="empty-state">Noch keine Einblicke – zeigt eurer Kundschaft, was bei euch los ist.</p>}
      {isDemo && count > 0 && (
        <p id={DEMO_HINT_ID} className="field-hint">
          {DEMO_HINT}
        </p>
      )}
      {count > 0 && (
        <ul className="einblicke-grid">
          {einblicke.map((einblick) => (
            <EinblickCard
              key={einblick.id}
              einblick={einblick}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
              demoHintId={isDemo ? DEMO_HINT_ID : undefined}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
