import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import Icon from './Icon.jsx'

const DEMO_HINT_ID = 'partner-card-order-demo-hint'
const EMPTY_HINT = 'Sobald ein Beitrag freigegeben ist, legt ihr hier fest, wie er auf eurer Karte in „Entdecken“ steht.'

// Wo steht die Anzeige gerade? (server/lib/partnerPostOrder.js entdeckenAnzeigen: aufKarte, inEntdecken, sichtbar)
function standOf(item, max) {
  if (item.aufKarte) return { text: 'auf der Karte', onCard: true }
  if (!item.inEntdecken) return { text: 'nur auf dem Portal', onCard: false }
  if (!item.sichtbar) return { text: 'zurzeit nicht aktiv', onCard: false }
  return { text: `nicht auf der Karte – es passen ${max === 3 ? 'drei' : max}`, onCard: false }
}

function moved(list, index, delta) {
  const next = list.slice()
  const [entry] = next.splice(index, 1)
  next.splice(index + delta, 0, entry)
  return next
}

function OrderItem({ item, index, count, max, busy, readOnly, onMove, onToggle }) {
  const stand = standOf(item, max)
  const quoted = `„${item.titel}“`
  const describedBy = readOnly ? DEMO_HINT_ID : undefined
  return (
    <li className={`partner-card-order-item${stand.onCard ? ' is-on-card' : ''}`}>
      <span className="partner-card-order-pos" aria-hidden="true">
        {index + 1}
      </span>
      <span className="partner-card-order-body">
        <span className="partner-card-order-title">{item.titel}</span>
        <span className="partner-card-order-meta">
          <span>{stand.text}</span>
          {item.vomTeam && <span>vom Team</span>}
        </span>
      </span>
      <label className="check partner-card-order-switch">
        <input
          type="checkbox"
          role="switch"
          checked={item.inEntdecken}
          disabled={readOnly}
          aria-busy={busy || undefined}
          aria-describedby={describedBy}
          onChange={(event) => onToggle(item, event.target.checked)}
        />
        in Entdecken zeigen<span className="visually-hidden">: {quoted}</span>
      </label>
      <span className="partner-card-order-moves">
        <button
          type="button"
          id={`card-order-${item.id}-up`}
          className="btn btn-ghost btn-icon"
          aria-label={`${quoted} nach oben`}
          aria-describedby={describedBy}
          disabled={readOnly || index === 0}
          onClick={() => onMove(index, -1)}
        >
          <Icon name="chevronDown" />
        </button>
        <button
          type="button"
          id={`card-order-${item.id}-down`}
          className="btn btn-ghost btn-icon"
          aria-label={`${quoted} nach unten`}
          aria-describedby={describedBy}
          disabled={readOnly || index === count - 1}
          onClick={() => onMove(index, 1)}
        >
          <Icon name="chevronDown" />
        </button>
      </span>
    </li>
  )
}

// Phase V1: "Eure Karte in Entdecken" im Bereich "Beiträge" - die freigegebenen Anzeigen der eigenen Karte (eigene
// Beiträge und vom Team verknüpfte Empfehlungen) in Karten-Reihenfolge. Pfeile statt Ziehen (per Tastatur bedienbar),
// je Anzeige der Schalter "in Entdecken zeigen" (aus = nur auf dem Portal). Beides ist reine Darstellung, ohne neue
// Freigabe. Nach dem Verschieben bleibt der Fokus auf dem Pfeil der verschobenen Anzeige; eine Live-Region sagt die
// neue Stelle an. Während einer Anfrage werden weitere Klicks übergangen statt die Knöpfe zu sperren - ein gesperrtes
// Element verlöre sonst den Tastatur-Fokus. refreshKey: Beiträge geändert -> neu laden. In der Demo sichtbar, aber
// gesperrt.
export default function PartnerCardOrder({ refreshKey }) {
  const readOnly = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const [data, setData] = useState(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState('')
  const focusAfter = useRef(null)

  useEffect(() => {
    let cancelled = false
    api.partnerArea
      .cardAnzeigen()
      .then((result) => {
        if (cancelled) return
        setData(result && Array.isArray(result.anzeigen) ? result : null)
        setError(null)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  useEffect(() => {
    if (!focusAfter.current) return
    const { id, direction } = focusAfter.current
    focusAfter.current = null
    const preferred = document.getElementById(`card-order-${id}-${direction}`)
    const other = document.getElementById(`card-order-${id}-${direction === 'up' ? 'down' : 'up'}`)
    ;(preferred && !preferred.disabled ? preferred : other)?.focus()
  }, [data])

  async function save(request, message, focus) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await request()
      focusAfter.current = focus
      setData(result)
      setStatus(message)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function handleMove(index, delta) {
    const next = moved(data.anzeigen, index, delta)
    const item = data.anzeigen[index]
    const message = `„${item.titel}“ steht jetzt an Stelle ${index + delta + 1}.`
    save(() => api.partnerArea.setCardOrder(next.map((entry) => entry.id)), message, { id: item.id, direction: delta < 0 ? 'up' : 'down' })
  }

  function handleToggle(item, inEntdecken) {
    const message = inEntdecken ? `„${item.titel}“ steht wieder in Entdecken.` : `„${item.titel}“ steht jetzt nur auf dem Portal.`
    save(() => api.partnerArea.setPostInEntdecken(item.id, inEntdecken), message, null)
  }

  if (data === undefined && !error) return null
  if (data && !data.bereich) return null
  const anzeigen = data?.anzeigen || []

  return (
    <section className="partner-card-order card" aria-labelledby="partner-card-order-title">
      <div className="partner-card-order-head">
        <h3 id="partner-card-order-title">Eure Karte in Entdecken</h3>
        <p className="partner-card-order-hint">
          Die ersten {data?.max === 3 || !data ? 'drei' : data.max} Anzeigen, die ihr zeigt, stehen auf eurer Karte – in dieser Reihenfolge.
          Auf eurem Portal stehen alle.
        </p>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {data && anzeigen.length === 0 && <p className="muted partner-card-order-empty">{EMPTY_HINT}</p>}
      {anzeigen.length > 0 && (
        <ol className="partner-card-order-list">
          {anzeigen.map((item, index) => (
            <OrderItem
              key={item.id}
              item={item}
              index={index}
              count={anzeigen.length}
              max={data.max}
              busy={busy}
              readOnly={readOnly}
              onMove={handleMove}
              onToggle={handleToggle}
            />
          ))}
        </ol>
      )}
      {readOnly && anzeigen.length > 0 && (
        <p id={DEMO_HINT_ID} className="field-hint">
          {readOnlyHint}
        </p>
      )}
      <p className="visually-hidden" aria-live="polite">
        {status}
      </p>
    </section>
  )
}
