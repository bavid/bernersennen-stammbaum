import { useState } from 'react'
import { api } from '../api'
import { formatDateLong } from '../lib/dates.js'
import { PIN_VON } from '../lib/einblicke.js'
import Icon from './Icon.jsx'

// Phase V1: einen Einblick für die eigene Karte in "Entdecken" anpinnen oder lösen (server/lib/einblickPins.js). Ein
// Umschalt-Knopf mit gleichbleibender Beschriftung (aria-pressed trägt den Zustand, angepinnt ist er kräftig). Anpinnen
// ist gesperrt, wenn schon drei angepinnt sind (canPin false) oder der Einblick ausgeblendet ist; beides, wenn die
// Sitzung nur liest. Hat das Team ihn angepinnt, steht nur ein Hinweis da - lösen kann ihn nur das Team.
export default function EinblickPinButton({ einblick, canPin, readOnly, demoHintId, onUpdated }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const pinned = Boolean(einblick.angepinntVon)

  if (einblick.angepinntVon === PIN_VON.admin) {
    return (
      <p className="einblick-pin-team">
        <Icon name="pin" />
        Vom Team angepinnt
      </p>
    )
  }

  async function handleClick() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      onUpdated(await (pinned ? api.partnerArea.unpinEinblick(einblick.id) : api.partnerArea.pinEinblick(einblick.id)))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Lösen geht immer, Anpinnen nur sichtbar und mit freiem Platz. Während der Anfrage nicht gesperrt (der Fokus bliebe
  // sonst nicht auf dem Knopf), weitere Klicks übergeht handleClick.
  const disabled = readOnly || (!pinned && (einblick.ausgeblendet || !canPin))
  return (
    <>
      <button
        type="button"
        className={`btn btn-ghost einblick-pin${pinned ? ' is-pinned' : ''}`}
        aria-pressed={pinned}
        disabled={disabled}
        aria-describedby={readOnly ? demoHintId : undefined}
        onClick={handleClick}
      >
        <Icon name="pin" />
        Anpinnen
        <span className="visually-hidden">: Einblick vom {formatDateLong(einblick.datum)}</span>
      </button>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}
