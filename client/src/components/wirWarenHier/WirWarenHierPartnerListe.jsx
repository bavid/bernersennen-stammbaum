import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import ConfirmButton from '../ConfirmButton.jsx'
import Icon from '../Icon.jsx'
import { formatDateLong, relativeTime } from '../../lib/dates.js'
import { useIsDemo, useReadOnlyHint } from '../../lib/demo.js'
import { speciesLabel } from '../../lib/timeline.js'
import { WWH, wwhErrorText } from '../../lib/wirWarenHierText.js'
import { t } from '../../lib/i18n/index.js'
import { Button } from '../ui/index.js'

const EMPTY = Object.freeze({ anmeldungen: [], erinnerungen: [] })

function listOf(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []
}

function openCount(data) {
  return [...data.anmeldungen, ...data.erinnerungen].filter((item) => item.status === 'offen').length
}

function DecideButtons({ label, disabled, onDecide }) {
  return (
    <>
      <Button type="button" size="sm" disabled={disabled} aria-label={t(WWH.freigebenLabel, { name: label })} onClick={() => onDecide(true)}>
        {t(WWH.freigeben)}
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label={t(WWH.ablehnenLabel, { name: label })} onClick={() => onDecide(false)}>
        {t(WWH.ablehnen)}
      </Button>
    </>
  )
}

function Anmeldung({ item, disabled, actions }) {
  const offen = item.status === 'offen'
  return (
    <li className={`wwh-request${offen ? ' is-open' : ''}`}>
      {item.fotoUrl ? (
        <img className="wwh-wish-photo" src={item.fotoUrl} alt="" width="40" height="40" loading="lazy" />
      ) : (
        <span className="wwh-wish-photo is-empty" aria-hidden="true">
          <Icon name="paw" />
        </span>
      )}
      <div className="wwh-request-body">
        <p className="wwh-request-title">
          {item.tierName} <span className="muted">· {speciesLabel(item.tierart)}</span>
        </p>
        <p className="wwh-request-meta">
          <span className={`pill${offen ? ' pill-rust' : ''}`}>{t(offen ? WWH.wartetAufEuch : WWH.istFreigegeben)}</span>
          {item.createdAt && relativeTime(item.createdAt)}
        </p>
      </div>
      <div className="wwh-request-actions">
        {offen ? (
          <DecideButtons label={item.tierName} disabled={disabled} onDecide={(ok) => actions.checkin(item, ok)} />
        ) : (
          <ConfirmButton
            label={WWH.entfernen}
            confirmLabel={WWH.entfernenFrage}
            ariaLabel={t(WWH.entfernenLabel, { name: item.tierName })}
            icon="close"
            className="btn-compact"
            disabled={disabled}
            onConfirm={() => actions.remove(item)}
          />
        )}
      </div>
    </li>
  )
}

function Erinnerung({ item, disabled, actions }) {
  const offen = item.status === 'offen'
  const label = `„${item.titel}“`
  return (
    <li className={`wwh-request${offen ? ' is-open' : ''}`}>
      <span className="wwh-wish-photo is-empty" aria-hidden="true">
        <Icon name="pin" />
      </span>
      <div className="wwh-request-body">
        <p className="wwh-request-title">{item.titel}</p>
        <p className="wwh-request-meta">
          <span className={`pill${offen ? ' pill-rust' : ''}`}>{t(offen ? WWH.wartetAufEuch : WWH.istFreigegeben)}</span>
          {t(WWH.vonTier, { name: item.tierName })} · {formatDateLong(item.datum)}
        </p>
        {item.text && <p className="wwh-request-text">{item.text}</p>}
      </div>
      <div className="wwh-request-actions">
        {offen ? (
          <DecideButtons label={label} disabled={disabled} onDecide={(ok) => actions.pin(item, ok)} />
        ) : (
          <Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label={t(WWH.ausblendenLabel, { titel: item.titel })} onClick={() => actions.pin(item, false)}>
            {t(WWH.ausblenden)}
          </Button>
        )}
      </div>
    </li>
  )
}

// Daten und Aktionen: jede Entscheidung lädt die Liste neu, sagt das Ergebnis an und meldet die Zahl offener Anfragen.
function usePartnerWwh(onCount) {
  const [data, setData] = useState(undefined)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState(null)

  const alive = useRef(true)
  const seq = useRef(0) // je Ladevorgang eine Nummer: eine überholte Antwort wird verworfen

  const load = useCallback(async () => {
    const id = ++seq.current
    const current = () => alive.current && id === seq.current
    try {
      const result = await api.partnerArea.wwh()
      if (!current()) return
      const next = { anmeldungen: listOf(result?.anmeldungen), erinnerungen: listOf(result?.erinnerungen) }
      setData(next)
      onCount?.(openCount(next))
    } catch (err) {
      if (!current()) return
      setData((cur) => cur ?? EMPTY)
      setError(wwhErrorText(err))
    }
  }, [onCount])

  useEffect(() => {
    alive.current = true
    load()
    return () => {
      alive.current = false
      seq.current += 1
    }
  }, [load])

  async function run(action, success) {
    setBusy(true)
    setError(null)
    setNotice('')
    try {
      await action()
      if (!alive.current) return
      setNotice(success)
      await load()
    } catch (err) {
      if (alive.current) setError(wwhErrorText(err))
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  const actions = {
    checkin: (item, ok) =>
      run(() => api.partnerArea.wwhDecideCheckin(item.id, ok), t(ok ? WWH.tierFreigegeben : WWH.tierAbgelehnt, { name: item.tierName })),
    remove: (item) => run(() => api.partnerArea.wwhRemoveCheckin(item.id), t(WWH.tierEntfernt, { name: item.tierName })),
    pin: (item, ok) =>
      run(() => api.partnerArea.wwhDecidePin(item.id, ok), t(ok ? WWH.erinnerungFreigegeben : WWH.erinnerungAusgeblendet, { titel: item.titel }))
  }
  return { data, busy, notice, error, actions }
}

function Gruppe({ title, empty, items, Item, disabled, actions }) {
  return (
    <section className="wwh-partner-group">
      <h3 className="wwh-subtitle">{t(title)}</h3>
      {items.length === 0 ? (
        <p className="wwh-note muted">{t(empty)}</p>
      ) : (
        <ul className="wwh-request-list" role="list">
          {items.map((item) => (
            <Item key={item.id} item={item} disabled={disabled} actions={actions} />
          ))}
        </ul>
      )}
    </section>
  )
}

// Posteingang des Partners, Reiter „Wir waren hier“: Anmeldungen und angeheftete Erinnerungen freigeben oder ablehnen,
// Freigegebenes später wieder entfernen bzw. ausblenden. Offene zuerst (wie der Server sie liefert). Demo: nur lesen.
// onCount: Zahl der offenen Anfragen (für den Zähler am Reiter).
export default function WirWarenHierPartnerListe({ onCount }) {
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const { data, busy, notice, error, actions } = usePartnerWwh(onCount)
  const disabled = isDemo || busy

  return (
    <div className="wwh-partner" aria-busy={busy || undefined}>
      <p className="page-lede wwh-partner-lede">{t(WWH.partnerLede)}</p>
      {isDemo && <p className="field-hint">{readOnlyHint}</p>}
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <p className="wwh-notice" role="status">
        {notice}
      </p>
      {data === undefined && <p className="muted">{t(WWH.laden)}</p>}
      {data && (
        <>
          <Gruppe title={WWH.anmeldungen} empty={WWH.keineAnmeldungen} items={data.anmeldungen} Item={Anmeldung} disabled={disabled} actions={actions} />
          <Gruppe title={WWH.angehefteteErinnerungen} empty={WWH.keineAngehefteten} items={data.erinnerungen} Item={Erinnerung} disabled={disabled} actions={actions} />
        </>
      )}
    </div>
  )
}
