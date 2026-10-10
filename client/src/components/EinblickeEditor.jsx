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
import { t } from '../lib/i18n/index.js'
import { Button } from './ui/index.js'

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
    labelFor: (id) => t('Einblick vom {date}', { date: formatDateLong(byId.get(id)?.datum) }),
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
      toast(t(ORDER_ERROR))
    }
  }

  return (
    <section className="einblicke-editor" aria-labelledby="einblicke-title">
      <div className="einblicke-head">
        <div>
          <h2 id="einblicke-title">{t('Einblicke')}</h2>
          <p className="muted">{t('Fotos aus eurem Alltag – sie erscheinen mit Datum auf eurem Portal.')}</p>
          <p className="field-hint einblicke-pin-hint">
            {t('Angepinnte Einblicke (höchstens {max}) stehen auf eurer Karte in „Entdecken“ – sonst die neuesten drei.', {
              max: MAX_ANGEPINNT === 3 ? t('drei') : MAX_ANGEPINNT
            })}{' '}
            <span className="einblicke-pin-count">{t('{n} von {max} angepinnt.', { n: Math.min(pinned, MAX_ANGEPINNT), max: MAX_ANGEPINNT })}</span>
            {teamPinned && <> {t('Vom Team angepinnte stehen zuerst.')}</>}
            {pinned >= MAX_ANGEPINNT && <> {t('Drei sind angepinnt – löst einen, um einen anderen anzupinnen.')}</>}
          </p>
          {count > 1 && <p className="field-hint">{t(REORDER_HINT)}</p>}
        </div>
        <span className="pill einblicke-count" aria-live="polite">
          {t('{n} von {max}', { n: count, max: MAX_EINBLICKE })}
        </span>
      </div>

      {composing ? (
        <EinblickForm isFull={isFull} onCreated={handleCreated} onCancel={() => setComposing(false)} />
      ) : (
        <div className="einblicke-actions">
          <Button
            type="button"
            onClick={() => setComposing(true)}
            disabled={isDemo || isFull || einblicke === undefined}
            aria-describedby={isDemo ? DEMO_HINT_ID : undefined}
          >
            <Icon name="plus" /> {t('Neuer Einblick')}
          </Button>
          {isDemo && (
            <p id={DEMO_HINT_ID} className="field-hint">
              {readOnlyHint}
            </p>
          )}
          {!isDemo && isFull && <p className="field-hint">{t(LIMIT_MESSAGE)}</p>}
        </div>
      )}

      {loadError && (
        <div className="error-banner" role="alert">
          {loadError}
        </div>
      )}
      {einblicke === undefined && !loadError && <p className="muted">{t('Lade …')}</p>}
      {einblicke?.length === 0 && <p className="empty-state">{t('Noch keine Einblicke – zeigt eurer Kundschaft, was bei euch los ist.')}</p>}
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
        <Button type="button" variant="ghost" className="einblicke-more" onClick={more.expand}>
          {t('Weitere Einblicke ({n})', { n: more.hidden })}
        </Button>
      )}
    </section>
  )
}
