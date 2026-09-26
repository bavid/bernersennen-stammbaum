import { useState } from 'react'
import PhotoPicker from './PhotoPicker.jsx'
import ConfirmButton from './ConfirmButton.jsx'
import { todayIso } from '../lib/dates.js'
import { readSetting, writeSetting } from '../lib/storage.js'

// Neuer oder bearbeiteter Timeline-Eintrag. Das Datum bestimmt die Position in der Chronik.
export default function TimelineEntryForm({ entry, onSubmit, onDelete, onCancel }) {
  const [autorName, setAutorName] = useState(() => entry?.autor_name || readSetting('autorName', ''))
  const [datum, setDatum] = useState(() => entry?.datum || todayIso())
  const [titel, setTitel] = useState(entry?.titel || '')
  const [text, setText] = useState(entry?.text || '')
  const [fotos, setFotos] = useState(entry?.foto_urls || [])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      writeSetting('autorName', autorName.trim())
      await onSubmit({ autorName, datum, titel, text, fotoUrls: fotos })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  async function handleDelete() {
    setError(null)
    setSaving(true)
    try {
      await onDelete()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form className="form-grid entry-form" onSubmit={handleSubmit}>
      {error && (
        <div className="error-banner span-2" role="alert">
          {error}
        </div>
      )}
      <div className="field span-2">
        <label className="field-label" htmlFor="entry-title">
          Was ist passiert?
        </label>
        <input
          id="entry-title"
          value={titel}
          onChange={(e) => setTitel(e.target.value)}
          placeholder="z. B. Erster Tag am See"
          maxLength={120}
          required
          autoFocus={!entry}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="entry-date">
          Datum
        </label>
        <input id="entry-date" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} required />
        <span className="field-hint">Der Eintrag wird automatisch an dieser Stelle einsortiert.</span>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="entry-author">
          Dein Name
        </label>
        <input
          id="entry-author"
          value={autorName}
          onChange={(e) => setAutorName(e.target.value)}
          maxLength={60}
          autoComplete="name"
          required
        />
      </div>
      <div className="field span-2">
        <label className="field-label" htmlFor="entry-text">
          Erzähl mehr <span className="muted">(optional)</span>
        </label>
        <textarea id="entry-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={5000} />
      </div>
      <div className="field span-2">
        <span className="field-label">Fotos</span>
        <PhotoPicker value={fotos} onChange={setFotos} label="Fotos" onBusyChange={setUploading} onError={setError} />
      </div>
      <div className="form-actions span-2">
        {onDelete && <ConfirmButton onConfirm={handleDelete} label="Eintrag löschen" disabled={saving} />}
        <span className="form-actions-spacer" />
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Abbrechen
          </button>
        )}
        <button className="btn btn-primary" type="submit" disabled={saving || uploading}>
          {saving ? 'Speichere …' : entry ? 'Speichern' : 'In die Chronik eintragen'}
        </button>
      </div>
    </form>
  )
}
