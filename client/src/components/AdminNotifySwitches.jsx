import { useState } from 'react'
import { api } from '../api'
import { DETAILS_KEY, EVENT_SWITCHES } from '../lib/adminNotify.js'

const DETAILS_HINT_ID = 'admin-notify-details-hint'

function Switch({ checked, disabled, onToggle, describedBy, children }) {
  return (
    <label className="check admin-notify-switch">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={onToggle} aria-describedby={describedBy} />
      {children}
    </label>
  )
}

// Schalter je Ereignis und "Details mitsenden" (PUT /api/admin/notify-settings, je Klick ein Schalter). Ohne Details
// meldet eine Nachricht nur, DASS es etwas Neues gibt - mit Details gehen personenbezogene Angaben an Telegram,
// deshalb der Hinweis direkt darunter. onChange bekommt die neue Antwort des Servers.
export default function AdminNotifySwitches({ settings, onChange }) {
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const values = settings.einstellungen || {}

  async function toggle(key) {
    setError(null)
    setBusy(key)
    try {
      onChange(await api.admin.updateNotifySettings({ [key]: !values[key] }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <fieldset className="admin-notify-switches">
      <legend>Benachrichtigen bei</legend>
      <div className="admin-notify-switch-list">
        {EVENT_SWITCHES.map(({ key, label }) => (
          <Switch key={key} checked={Boolean(values[key])} disabled={busy !== null} onToggle={() => toggle(key)}>
            {label}
          </Switch>
        ))}
      </div>
      <div className="admin-notify-details">
        <Switch
          checked={Boolean(values[DETAILS_KEY])}
          disabled={busy !== null}
          onToggle={() => toggle(DETAILS_KEY)}
          describedBy={DETAILS_HINT_ID}
        >
          Details mitsenden (Name, E-Mail, Bereich)
        </Switch>
        <p className="field-hint" id={DETAILS_HINT_ID}>
          Dann gehen Name und E-Mail-Adresse einer Anfrage, der Name eines neuen Bereichs, der Anfang eines Feedbacks bzw.
          der Titel eines Beitrags an Telegram – einen externen Dienst. Ohne Details meldet die Nachricht nur, dass es etwas
          Neues gibt.
        </p>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  )
}
