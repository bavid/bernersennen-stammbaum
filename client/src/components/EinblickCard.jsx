import { useState } from 'react'
import { api } from '../api'
import { useIsDemo } from '../lib/demo.js'
import { formatDateLong, todayIso } from '../lib/dates.js'
import { MAX_EINBLICK_TEXT, einblickChanges, isUploadUrl } from '../lib/einblicke.js'
import ConfirmButton from './ConfirmButton.jsx'
import Icon from './Icon.jsx'

// Datum und Text eines Einblicks direkt in der Karte ändern - das Foto bleibt (neues Foto = neuer Einblick).
function EinblickEditForm({ einblick, onSaved, onCancel }) {
  const [draft, setDraft] = useState({ datum: einblick.datum, text: einblick.text ?? '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const idBase = `einblick-${einblick.id}`

  async function handleSubmit(event) {
    event.preventDefault()
    const changes = einblickChanges(draft, einblick)
    if (!Object.keys(changes).length) {
      onCancel()
      return
    }
    setBusy(true)
    setError(null)
    try {
      onSaved(await api.partnerArea.updateEinblick(einblick.id, changes))
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form className="einblick-edit form-stack" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label className="field-label" htmlFor={`${idBase}-datum`}>
          Datum
        </label>
        <input
          id={`${idBase}-datum`}
          type="date"
          value={draft.datum}
          max={todayIso()}
          required
          onChange={(e) => setDraft((current) => ({ ...current, datum: e.target.value }))}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor={`${idBase}-text`}>
          Text
        </label>
        <textarea
          id={`${idBase}-text`}
          value={draft.text}
          maxLength={MAX_EINBLICK_TEXT}
          rows={3}
          aria-describedby={`${idBase}-count`}
          onChange={(e) => setDraft((current) => ({ ...current, text: e.target.value }))}
        />
        <p className="field-hint" id={`${idBase}-count`}>
          {draft.text.length} / {MAX_EINBLICK_TEXT}
        </p>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || !draft.datum}>
          {busy ? 'Speichere …' : 'Speichern'}
        </button>
      </div>
    </form>
  )
}

// Ein Einblick im Raster: Foto, Datum, Text, dazu "ausgeblendet vom Betreiber", wenn der Admin ihn
// verborgen hat (dann erscheint er nicht auf dem Portal). Bearbeiten klappt Datum/Text inline auf,
// Löschen fragt einmal nach (ConfirmButton). In der Demo sind beide gesperrt.
export default function EinblickCard({ einblick, onUpdated, onDeleted, demoHintId }) {
  const isDemo = useIsDemo()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)
  const dateLabel = formatDateLong(einblick.datum)

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      await api.partnerArea.deleteEinblick(einblick.id)
      onDeleted(einblick.id)
    } catch (err) {
      setError(err.message)
      setDeleting(false)
    }
  }

  function handleSaved(updated) {
    setEditing(false)
    onUpdated(updated)
  }

  return (
    <li className={`einblick-card${einblick.ausgeblendet ? ' is-hidden-by-admin' : ''}`}>
      <div className="einblick-photo">
        {isUploadUrl(einblick.fotoUrl) && <img src={einblick.fotoUrl} alt={`Einblick vom ${dateLabel}`} loading="lazy" />}
        {einblick.ausgeblendet && (
          <span className="pill einblick-hidden-badge">
            <Icon name="eye" />
            ausgeblendet vom Betreiber
          </span>
        )}
      </div>

      <div className="einblick-body">
        {editing ? (
          <EinblickEditForm einblick={einblick} onSaved={handleSaved} onCancel={() => setEditing(false)} />
        ) : (
          <>
            <time className="einblick-date" dateTime={einblick.datum}>
              {dateLabel}
            </time>
            {einblick.text && <p className="einblick-text">{einblick.text}</p>}
            <div className="einblick-actions">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={isDemo || deleting}
                aria-describedby={isDemo ? demoHintId : undefined}
                onClick={() => setEditing(true)}
              >
                <Icon name="edit" />
                Bearbeiten
              </button>
              <ConfirmButton
                disabled={isDemo || deleting}
                describedBy={isDemo ? demoHintId : undefined}
                onConfirm={handleDelete}
                label="Löschen"
                confirmLabel="Wirklich löschen?"
              />
            </div>
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </li>
  )
}
