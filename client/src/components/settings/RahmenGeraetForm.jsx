import { useId, useState } from 'react'
import Icon from '../Icon.jsx'
import FrameAuswahl from '../bilderrahmen/FrameAuswahl.jsx'
import FrameSettings from '../bilderrahmen/FrameSettings.jsx'
import { DEFAULT_OPTIONEN } from '../../lib/bilderrahmen.js'

const MAX_NAME_LENGTH = 40

// Einen Bilderrahmen für ein anderes Gerät einrichten: Name („Wohnzimmer Oma“), welche eigenen Tiere und welcher
// Zeitraum, Anzeige - und ausdrücklich, ob auch private Erinnerungen dabei sein dürfen (Vorgabe: nein). tiere: die
// eigenen Tiere des Zuhauses ({ id, name, inErinnerung }). onSubmit({ name, auswahl }) wirft bei Fehlern (Meldung hier).
export default function RahmenGeraetForm({ tiere, onSubmit, onCancel }) {
  const id = useId()
  const [name, setName] = useState('')
  const [auswahl, setAuswahl] = useState({ tiere: [], zeitraum: 'alle' })
  const [optionen, setOptionen] = useState({ ...DEFAULT_OPTIONEN })
  const [privat, setPrivat] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await onSubmit({ name: name.trim(), auswahl: { ...auswahl, ...optionen, privat } })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form className="rahmen-form" onSubmit={handleSubmit} aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>Neuer Bilderrahmen</h3>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="field">
        <label className="field-label" htmlFor={`${id}-name`}>
          Name des Geräts
        </label>
        <input
          id={`${id}-name`}
          value={name}
          maxLength={MAX_NAME_LENGTH}
          required
          placeholder="z. B. Wohnzimmer Oma"
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <FrameAuswahl tiere={tiere} auswahl={auswahl} onChange={setAuswahl} idPrefix={`${id}-rahmen`} />
      <FrameSettings optionen={optionen} onChange={setOptionen} idPrefix={`${id}-rahmen`}>
        <fieldset className="frame-settings-group">
          <legend>Private Erinnerungen</legend>
          <label className="check">
            <input type="checkbox" checked={privat} onChange={(event) => setPrivat(event.target.checked)} />
            Auch private Erinnerungen zeigen
          </label>
          <p className="field-hint">
            Private Erinnerungen seht sonst nur ihr. Auf dem Bilderrahmen sieht sie jeder, der davorsteht – nur mit Haken.
          </p>
        </fieldset>
      </FrameSettings>
      <div className="settings-actions">
        <button type="submit" className="btn btn-primary" disabled={saving || !name.trim()}>
          <Icon name="frame" />
          {saving ? 'Wird eingerichtet …' : 'Link erstellen'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </form>
  )
}
