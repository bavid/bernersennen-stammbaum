import { useEffect, useState } from 'react'
import { api } from '../api'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import { LIMIT_MESSAGE, MAX_ANGEPINNT, MAX_EINBLICKE, countPinned, sortEinblicke } from '../lib/einblicke.js'
import useShowMore from '../hooks/useShowMore.js'
import EinblickCard from './EinblickCard.jsx'
import EinblickForm from './EinblickForm.jsx'
import Icon from './Icon.jsx'

const DEMO_HINT_ID = 'einblicke-demo-hint'
// Audit W: zuerst sechs Karten, der Rest hinter „Weitere Einblicke (n)“ - der Reiter „Fotos“ bleibt so kurz.
export const VISIBLE_EINBLICKE = 6

// Einblicke im Reiter "Fotos" auf /profil (Phase P, seit Audit W unter PartnerFotosPanel): Fotos mit Datum, die auf dem
// Portal erscheinen - oben der Knopf "Neuer Einblick" (das Formular öffnet erst auf Wunsch, wie bei den Beiträgen), darunter
// das Raster der vorhandenen (neueste zuerst, zuerst VISIBLE_EINBLICKE). Höchstens MAX_EINBLICKE; onChanged meldet
// Anlegen/Löschen, damit die Statuskarte ihre Empfehlung "mindestens ein Einblick" auffrischt.
export default function EinblickeEditor({ onChanged }) {
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const [einblicke, setEinblicke] = useState(undefined)
  const [loadError, setLoadError] = useState(null)
  const [composing, setComposing] = useState(false)
  const count = einblicke?.length ?? 0
  const isFull = count >= MAX_EINBLICKE
  const pinned = countPinned(einblicke)
  const teamPinned = (einblicke || []).some((einblick) => einblick.angepinntVon === 'admin' && !einblick.ausgeblendet)
  const more = useShowMore(einblicke, VISIBLE_EINBLICKE)

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
    setComposing(false)
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

      {composing ? (
        <EinblickForm isFull={isFull} onCreated={handleCreated} onCancel={() => setComposing(false)} />
      ) : (
        <div className="einblicke-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setComposing(true)}
            disabled={isDemo || isFull || einblicke === undefined}
            aria-describedby={isDemo ? DEMO_HINT_ID : undefined}
          >
            <Icon name="plus" /> Neuer Einblick
          </button>
          {isDemo && (
            <p id={DEMO_HINT_ID} className="field-hint">
              {readOnlyHint}
            </p>
          )}
          {!isDemo && isFull && <p className="field-hint">{LIMIT_MESSAGE}</p>}
        </div>
      )}

      {loadError && (
        <div className="error-banner" role="alert">
          {loadError}
        </div>
      )}
      {einblicke === undefined && !loadError && <p className="muted">Lade …</p>}
      {einblicke?.length === 0 && <p className="empty-state">Noch keine Einblicke – zeigt eurer Kundschaft, was bei euch los ist.</p>}
      {count > 0 && (
        <ul className="einblicke-grid" ref={more.focusRef}>
          {more.shown.map((einblick) => (
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
      {more.hidden > 0 && (
        <button type="button" className="btn btn-ghost einblicke-more" onClick={more.expand}>
          Weitere Einblicke ({more.hidden})
        </button>
      )}
    </section>
  )
}
