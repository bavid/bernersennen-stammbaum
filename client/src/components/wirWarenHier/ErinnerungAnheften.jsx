import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import Icon from '../Icon.jsx'
import Modal from '../Modal.jsx'
import { formatDateLong } from '../../lib/dates.js'
import { WWH, wwhErrorText } from '../../lib/wirWarenHierText.js'
import { t } from '../../lib/i18n/index.js'

// Was sich anheften lässt: eigene (nicht gespiegelte), nicht private Erinnerungen dieses Tiers, die noch nicht hängen.
function pinnable(entries, checkin) {
  const pinned = new Set(checkin.erinnerungen.map((pin) => pin.entryId))
  return entries
    .filter((entry) => entry && !entry.gespiegelt && !entry.privat && entry.dog_id === checkin.dogId && !pinned.has(entry.id))
    .sort((a, b) => String(b.datum).localeCompare(String(a.datum)))
}

// Der Dialog: Erinnerung auswählen (Radios) und anheften.
function AuswahlDialog({ open, checkin, onClose, onPin }) {
  const [entries, setEntries] = useState(null)
  const [error, setError] = useState(null)
  const [choice, setChoice] = useState(null)

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    setEntries(null)
    setChoice(null)
    setError(null)
    api
      .listTimeline(checkin.dogId)
      .then((list) => !cancelled && setEntries(Array.isArray(list) ? list : []))
      .catch((err) => !cancelled && setError(wwhErrorText(err)))
    return () => {
      cancelled = true
    }
  }, [open, checkin.dogId])

  const options = entries && pinnable(entries, checkin)

  async function handleSubmit(event) {
    event.preventDefault()
    const entry = options?.find((item) => item.id === choice)
    if (entry && (await onPin(checkin.id, entry.id, entry.titel))) onClose()
  }

  return (
    <Modal open={open} title={t(WWH.erinnerungAnheften)} onClose={onClose}>
      <form className="wwh-dialog" onSubmit={handleSubmit}>
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        {entries === null && !error && <p className="muted">{t(WWH.laden)}</p>}
        {options?.length === 0 && <p className="muted">{t(WWH.keinePassende)}</p>}
        {options?.length > 0 && (
          <fieldset className="wwh-choices">
            <legend>{t(WWH.erinnerungWaehlen)}</legend>
            {options.map((entry) => (
              <label key={entry.id} className="wwh-choice">
                <input type="radio" name="wwh-erinnerung" checked={choice === entry.id} onChange={() => setChoice(entry.id)} />
                <span className="wwh-choice-title">{entry.titel}</span>
                <span className="wwh-choice-date">{formatDateLong(entry.datum)}</span>
              </label>
            ))}
          </fieldset>
        )}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t(WWH.abbrechen)}
          </button>
          <button type="submit" className="btn btn-primary" disabled={choice === null}>
            {t(WWH.anheften)}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// Angeheftete Erinnerungen einer eigenen Anmeldung: Liste (offene „wartet auf Freigabe“) mit „Lösen“, darunter
// „Erinnerung anheften“ - erst nach der Freigabe durch den Ort. Nach dem Dialog geht der Fokus zurück auf den Knopf.
export default function ErinnerungAnheften({ checkin, ortName, disabled, onPin, onUnpin }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef(null)
  const wasOpen = useRef(false)
  const confirmed = checkin.status === 'bestaetigt'

  useEffect(() => {
    if (wasOpen.current && !open) trigger.current?.focus()
    wasOpen.current = open
  }, [open])

  return (
    <div className="wwh-pins">
      <h4 className="wwh-pins-title">{t(WWH.erinnerungen)}</h4>
      {checkin.erinnerungen.length > 0 ? (
        <ul className="wwh-pin-list" role="list">
          {checkin.erinnerungen.map((pin) => (
            <li key={pin.id} className="wwh-pin">
              <span className="wwh-pin-title">{pin.titel}</span>
              <span className="wwh-pin-meta">
                {formatDateLong(pin.datum)}
                {pin.status === 'offen' && <span className="pill pill-rust">{t(WWH.erinnerungWartet)}</span>}
              </span>
              <button type="button" className="btn btn-ghost btn-compact" disabled={disabled} aria-label={t(WWH.loesenLabel, { titel: pin.titel })} onClick={() => onUnpin(checkin.id, pin)}>
                {t(WWH.loesen)}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        confirmed && <p className="wwh-note muted">{t(WWH.keineErinnerungen)}</p>
      )}
      {confirmed ? (
        <button ref={trigger} type="button" className="btn btn-ghost btn-compact wwh-pin-add" disabled={disabled} onClick={() => setOpen(true)}>
          <Icon name="pin" />
          {t(WWH.erinnerungAnheften)}
        </button>
      ) : (
        <p className="wwh-note muted">{t(WWH.erstNachFreigabe, { ort: ortName })}</p>
      )}
      <AuswahlDialog open={open} checkin={checkin} onClose={() => setOpen(false)} onPin={onPin} />
    </div>
  )
}
