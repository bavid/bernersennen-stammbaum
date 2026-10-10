import { useState } from 'react'
import { api } from '../api'
import AdminField, { fieldProps } from './AdminField.jsx'
import AdminHinweisZeitraum from './AdminHinweisZeitraum.jsx'
import HinweisCarousel from './HinweisCarousel.jsx'
import useFocusFirstError from '../hooks/useFocusFirstError.js'
import {
  MAX_TEXT_LENGTH,
  MAX_TITEL_LENGTH,
  STUFE_OPTIONS,
  hinweisClientErrors,
  initialHinweisForm,
  toHinweisPayload
} from '../lib/hinweise.js'

const IDS = {
  titel: 'admin-hinweis-titel',
  text: 'admin-hinweis-text',
  titelEn: 'admin-hinweis-titel-en',
  textEn: 'admin-hinweis-text-en',
  stufe: 'admin-hinweis-stufe'
}
const PREVIEW_ID = 'vorschau'
const PREVIEW_TITLE = 'Titel des Hinweises'
// Feld aus der Server-Antwort ({ error, feld }, server/routes/adminHinweise.js) -> Schlüssel der Feldfehler hier.
const SERVER_FIELDS = ['titel', 'text', 'titelEn', 'textEn', 'stufe', 'start', 'ende']

function withoutKeys(object, keys) {
  return Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)))
}

// Feldfehler-Schlüssel zu einem geänderten Formularwert (Datum/Uhrzeit teilen sich "start" bzw. "ende").
function errorKeysFor(patch) {
  return Object.keys(patch).map((key) => key.replace(/(Date|Time)$/, ''))
}

function Preview({ form }) {
  const hinweis = { id: PREVIEW_ID, titel: form.titel.trim() || PREVIEW_TITLE, text: form.text.trim() || null, stufe: form.stufe }
  return (
    <div className="admin-hinweis-preview span-2">
      <p className="field-label" aria-hidden="true">
        Vorschau
      </p>
      <HinweisCarousel hinweise={[hinweis]} preview />
    </div>
  )
}

// Optional: englische Fassung - wer die Seite auf Englisch nutzt, sieht sie statt der deutschen (lib/hinweise.js
// localizeHinweis). Leer = alle sehen Deutsch.
function EnglishFields({ form, fieldErrors, update }) {
  return (
    <>
      <AdminField
        id={IDS.titelEn}
        label="Titel auf Englisch (optional)"
        error={fieldErrors.titelEn}
        hint="Für alle, die die Seite auf Englisch nutzen. Leer lassen = sie sehen den deutschen Hinweis."
        className="span-2"
      >
        <input
          {...fieldProps(IDS.titelEn, { error: fieldErrors.titelEn, hint: true })}
          value={form.titelEn}
          maxLength={MAX_TITEL_LENGTH}
          onChange={(e) => update({ titelEn: e.target.value })}
        />
      </AdminField>
      <AdminField id={IDS.textEn} label="Text auf Englisch (optional)" error={fieldErrors.textEn} className="span-2">
        <textarea
          {...fieldProps(IDS.textEn, { error: fieldErrors.textEn })}
          value={form.textEn}
          maxLength={MAX_TEXT_LENGTH}
          rows={3}
          onChange={(e) => update({ textEn: e.target.value })}
        />
      </AdminField>
    </>
  )
}

// Anlegen (hinweis fehlt) und Bearbeiten eines globalen Hinweises - mit Live-Vorschau des Bands. Fehler stehen am Feld
// (vom Client wie vom Server, dort über details.feld), sonst oben; danach springt der Fokus zum ersten Fehler.
export default function AdminHinweisForm({ hinweis = null, onSaved, onCancel }) {
  const [form, setForm] = useState(() => initialHinweisForm(hinweis))
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const { formRef, bannerRef, focusFirstError } = useFocusFirstError()

  function update(patch) {
    setForm((current) => ({ ...current, ...patch }))
    setFieldErrors((current) => withoutKeys(current, errorKeysFor(patch)))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    const clientErrors = hinweisClientErrors(form)
    setFieldErrors(clientErrors)
    if (Object.keys(clientErrors).length) return focusFirstError()

    setSaving(true)
    try {
      const payload = toHinweisPayload(form)
      if (hinweis) await api.admin.updateHinweis(hinweis.id, payload)
      else await api.admin.createHinweis(payload)
      onSaved()
    } catch (err) {
      const feld = err.details?.feld
      if (SERVER_FIELDS.includes(feld)) setFieldErrors({ [feld]: err.message })
      else setError(err.message)
      setSaving(false)
      focusFirstError()
    }
  }

  const bind = (key) => fieldProps(IDS[key], { error: fieldErrors[key] })
  return (
    <form ref={formRef} className="admin-hinweis-form form-stack" onSubmit={handleSubmit} noValidate>
      <h3>{hinweis ? `Bearbeiten – ${hinweis.titel}` : 'Neuer Hinweis'}</h3>
      {error && (
        <div ref={bannerRef} className="error-banner" role="alert" tabIndex={-1}>
          {error}
        </div>
      )}
      <div className="form-grid">
        <Preview form={form} />
        <AdminField id={IDS.titel} label="Titel" error={fieldErrors.titel} className="span-2">
          <input
            {...bind('titel')}
            value={form.titel}
            maxLength={MAX_TITEL_LENGTH}
            onChange={(e) => update({ titel: e.target.value })}
            required
            autoFocus
          />
        </AdminField>
        <AdminField
          id={IDS.text}
          label="Text (optional)"
          error={fieldErrors.text}
          hint={`Aufklappbar unter „Mehr“. Reiner Text, Zeilenumbrüche erlaubt – höchstens ${MAX_TEXT_LENGTH} Zeichen.`}
          className="span-2"
        >
          <textarea
            {...fieldProps(IDS.text, { error: fieldErrors.text, hint: true })}
            value={form.text}
            maxLength={MAX_TEXT_LENGTH}
            rows={3}
            onChange={(e) => update({ text: e.target.value })}
          />
        </AdminField>
        <EnglishFields form={form} fieldErrors={fieldErrors} update={update} />
        <AdminField id={IDS.stufe} label="Stufe" error={fieldErrors.stufe}>
          <select {...bind('stufe')} value={form.stufe} onChange={(e) => update({ stufe: e.target.value })}>
            {STUFE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </AdminField>
        <div className="field admin-hinweis-aktiv">
          <label className="check">
            <input id="admin-hinweis-aktiv" type="checkbox" checked={form.aktiv} onChange={(e) => update({ aktiv: e.target.checked })} />
            Eingeschaltet (im Zeitraum sichtbar)
          </label>
        </div>
        <AdminHinweisZeitraum form={form} fieldErrors={fieldErrors} update={update} />
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Speichere …' : 'Speichern'}
        </button>
      </div>
    </form>
  )
}
