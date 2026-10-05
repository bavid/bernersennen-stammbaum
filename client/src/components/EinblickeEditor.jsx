import { useEffect, useState } from 'react'
import { api } from '../api'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import { formatDateLong } from '../lib/dates.js'
import { LIMIT_MESSAGE, MAX_ANGEPINNT, MAX_EINBLICKE, applyEinblickeOrder, countPinned, sortEinblicke } from '../lib/einblicke.js'
import { ORDER_ERROR } from '../lib/reorder.js'
import useDragReorder from '../hooks/useDragReorder.js'
import useShowMore from '../hooks/useShowMore.js'
import EinblickCard from './EinblickCard.jsx'
import EinblickForm from './EinblickForm.jsx'
import Icon from './Icon.jsx'
import { useToast } from './Toast.jsx'

const DEMO_HINT_ID = 'einblicke-demo-hint'
// Audit W: zuerst sechs Karten, der Rest hinter „Weitere Einblicke (n)“ - der Reiter „Fotos“ bleibt so kurz.
export const VISIBLE_EINBLICKE = 6
export const REORDER_HINT = 'Reihenfolge ändern: ein Foto am Griff ziehen – oder den Griff mit der Leertaste aufnehmen und mit den Pfeiltasten bewegen.'

// Einblicke im Reiter "Fotos" auf /profil (Phase P, seit Audit W unter PartnerFotosPanel): Fotos mit Datum, die auf dem
// Portal erscheinen - oben der Knopf "Neuer Einblick" (das Formular öffnet erst auf Wunsch, wie bei den Beiträgen), darunter
// das Raster der vorhandenen (neueste zuerst, zuerst VISIBLE_EINBLICKE). Höchstens MAX_EINBLICKE; onChanged meldet
// Anlegen/Löschen, damit die Statuskarte ihre Empfehlung "mindestens ein Einblick" auffrischt.
// Anordnen: jede Karte hat einen Griff (ReorderHandle, hooks/useDragReorder.js) - ziehen oder per Tastatur; die neue
// Reihenfolge gilt sofort (optimistisch) und geht als vollständige Id-Liste an den Server; scheitert das, springt die
// alte zurück. In der Demo bleibt sie nur lokal.
export default function EinblickeEditor({ onChanged }) {
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const toast = useToast()
  const [einblicke, setEinblicke] = useState(undefined)
  const [loadError, setLoadError] = useState(null)
  const [composing, setComposing] = useState(false)
  const count = einblicke?.length ?? 0
  const isFull = count >= MAX_EINBLICKE
  const pinned = countPinned(einblicke)
  const teamPinned = (einblicke || []).some((einblick) => einblick.angepinntVon === 'admin' && !einblick.ausgeblendet)
  const more = useShowMore(einblicke, VISIBLE_EINBLICKE)
  const byId = new Map((einblicke || []).map((einblick) => [einblick.id, einblick]))
  const reorder = useDragReorder({
    keys: more.shown.map((einblick) => einblick.id),
    disabled: more.shown.length < 2,
    labelFor: (id) => `Einblick vom ${formatDateLong(byId.get(id)?.datum)}`,
    onCommit: handleReorder
  })

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

  // Die sichtbaren in neuer Reihenfolge, die noch verborgenen („Weitere“) dahinter wie bisher - zusammen die ganze Liste.
  async function handleReorder(nextShownIds) {
    const previous = einblicke
    const ids = [...nextShownIds, ...previous.slice(more.shown.length).map((einblick) => einblick.id)]
    setEinblicke(applyEinblickeOrder(previous, ids))
    if (isDemo) {
      toast(readOnlyHint)
      return
    }
    try {
      setEinblicke(sortEinblicke(await api.partnerArea.setEinblickeOrder(ids)))
    } catch {
      setEinblicke(previous)
      toast(ORDER_ERROR)
    }
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
          {count > 1 && <p className="field-hint">{REORDER_HINT}</p>}
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
      <p className="visually-hidden" aria-live="assertive">
        {reorder.announcement}
      </p>
      {count > 0 && (
        <ul className="einblicke-grid" ref={more.focusRef}>
          {reorder.order.map((id, index) => (
            <EinblickCard
              key={id}
              einblick={byId.get(id)}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
              demoHintId={isDemo ? DEMO_HINT_ID : undefined}
              canPin={pinned < MAX_ANGEPINNT}
              reorder={more.shown.length > 1 ? { hook: reorder, index, count: more.shown.length } : null}
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
