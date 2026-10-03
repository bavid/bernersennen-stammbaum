import { useEffect, useState } from 'react'
import { api } from '../api'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import { MAX_ANGEPINNT, MAX_EINBLICKE, countPinned, sortEinblicke } from '../lib/einblicke.js'
import EinblickCard from './EinblickCard.jsx'
import EinblickForm from './EinblickForm.jsx'

const DEMO_HINT_ID = 'einblicke-demo-hint'

// Reiter "Einblicke" auf /profil (Phase P): Fotos mit Datum, die auf dem Portal erscheinen - oben das
// Formular "Neuer Einblick", darunter das Raster der vorhandenen (neueste zuerst). Höchstens
// MAX_EINBLICKE; onChanged meldet Anlegen/Löschen, damit die Statuskarte ihre Empfehlung
// "mindestens ein Einblick" auffrischt.
export default function EinblickeEditor({ onChanged }) {
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const [einblicke, setEinblicke] = useState(undefined)
  const [loadError, setLoadError] = useState(null)
  const count = einblicke?.length ?? 0
  const pinned = countPinned(einblicke)
  const teamPinned = (einblicke || []).some((einblick) => einblick.angepinntVon === 'admin' && !einblick.ausgeblendet)

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
          <p className="field-hint einblicke-pin-hint">
            Angepinnte Einblicke (höchstens {MAX_ANGEPINNT === 3 ? 'drei' : MAX_ANGEPINNT}) stehen auf eurer Karte in „Entdecken“ – sonst
            die neuesten drei. <span className="einblicke-pin-count">{Math.min(pinned, MAX_ANGEPINNT)} von {MAX_ANGEPINNT} angepinnt.</span>
            {teamPinned && <> Vom Team angepinnte stehen zuerst.</>}
            {pinned >= MAX_ANGEPINNT && <> Drei sind angepinnt – löst einen, um einen anderen anzupinnen.</>}
          </p>
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
      {/* Audit V7a: das Formular direkt darüber zeigt denselben Satz schon - hier nur für aria-describedby der Knöpfe. */}
      {isDemo && count > 0 && (
        <p id={DEMO_HINT_ID} className="visually-hidden">
          {readOnlyHint}
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
              canPin={pinned < MAX_ANGEPINNT}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
