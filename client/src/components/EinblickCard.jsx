import { useState } from 'react'
import { api } from '../api'
import { useIsDemo } from '../lib/demo.js'
import { formatDateLong, todayIso } from '../lib/dates.js'
import { MAX_EINBLICK_TEXT, einblickChanges, isUploadUrl } from '../lib/einblicke.js'
import ConfirmButton from './ConfirmButton.jsx'
import EinblickPinButton from './EinblickPinButton.jsx'
import Icon from './Icon.jsx'
import ReorderHandle from './ReorderHandle.jsx'
import { t } from '../lib/i18n/index.js'

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
          {t('Datum')}
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
          {t('Text')}
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
          {t(error)}
        </p>
      )}
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {t('Abbrechen')}
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || !draft.datum}>
          {busy ? t('Speichere …') : t('Speichern')}
        </button>
      </div>
    </form>
  )
}

// Ein Einblick im Raster: Foto, Datum, Text, dazu "Vom Team ausgeblendet" (Audit V7a: dieselben Worte wie im Kalender), wenn der Admin ihn
// verborgen hat (dann erscheint er nicht auf dem Portal). Bearbeiten klappt Datum/Text inline auf,
// Löschen fragt einmal nach (ConfirmButton) und steht abgesetzt am Ende der Zeile. In der Demo sind beide gesperrt. Phase V1: dazu "Anpinnen" für die Karte in
// "Entdecken" (EinblickPinButton) - canPin false, sobald drei angepinnt sind.
// reorder (Reiter „Fotos“): { hook, index, count } aus useDragReorder - dann trägt die Karte einen Griff zum Anordnen
// (ReorderHandle) und zeigt Ziehen, Ablageziel und „aufgenommen“ an; null ohne.
export default function EinblickCard({ einblick, onUpdated, onDeleted, demoHintId, canPin = true, reorder = null }) {
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
    <li
      ref={reorder?.hook.itemRef(einblick.id)}
      className={`einblick-card${einblick.ausgeblendet ? ' is-hidden-by-admin' : ''}${editing ? ' is-editing' : ''}${reorder ? ` ${reorder.hook.itemClass(einblick.id)}` : ''}`}
      style={reorder?.hook.itemStyle(einblick.id)}
    >
      <div className="einblick-photo">
        {isUploadUrl(einblick.fotoUrl) && <img src={einblick.fotoUrl} alt={t('Einblick vom {datum}', { datum: dateLabel })} loading="lazy" />}
        {reorder && (
          <ReorderHandle reorder={reorder.hook} itemKey={einblick.id} index={reorder.index} count={reorder.count} label={t('Einblick vom {datum}', { datum: dateLabel })} className="einblick-handle" />
        )}
        {einblick.ausgeblendet && (
          <span className="pill einblick-hidden-badge">
            <Icon name="eyeOff" />
            {t('Vom Team ausgeblendet')}
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
                className="btn btn-ghost btn-compact"
                disabled={isDemo || deleting}
                aria-describedby={isDemo ? demoHintId : undefined}
                onClick={() => setEditing(true)}
              >
                <Icon name="edit" />
                {t('Bearbeiten')}
              </button>
              <EinblickPinButton einblick={einblick} canPin={canPin} readOnly={isDemo} demoHintId={demoHintId} onUpdated={onUpdated} />
              <ConfirmButton
                disabled={isDemo || deleting}
                describedBy={isDemo ? demoHintId : undefined}
                onConfirm={handleDelete}
                label={t('Löschen')}
                confirmLabel={t('Wirklich löschen?')}
                className="btn-compact btn-quiet btn-end"
              />
            </div>
            {error && (
              <p className="field-error" role="alert">
                {t(error)}
              </p>
            )}
          </>
        )}
      </div>
    </li>
  )
}
