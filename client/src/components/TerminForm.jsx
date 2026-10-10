import { useState } from 'react'
import { api } from '../api'
import useFocusFirstError from '../hooks/useFocusFirstError.js'
import AdminField, { fieldProps } from './AdminField.jsx'
import { formatDateLong } from '../lib/dates.js'
import {
  MAX_ORT_LENGTH,
  MAX_TEXT_LENGTH,
  MAX_TITEL_LENGTH,
  SERIE,
  initialTerminForm,
  maxSerieBis,
  serieOptions,
  serieSkipsMonths,
  terminClientErrors,
  terminErrorField,
  toTerminPayload
} from '../lib/termine.js'
import { t } from '../lib/i18n/index.js'

const IDS = {
  titel: 'termin-titel',
  datum: 'termin-datum',
  uhrzeit: 'termin-uhrzeit',
  ende: 'termin-ende',
  serie: 'termin-serie',
  serieBis: 'termin-serie-bis',
  ort: 'termin-ort',
  text: 'termin-text'
}

const SERIES_EDIT_HINT = 'Änderungen gelten für die ganze Serie. Einzelne Tage sagt ihr in der Übersicht ab.'
const SKIP_HINT = 'In Monaten ohne diesen Tag findet der Termin nicht statt.'

function withoutKeys(object, keys) {
  return Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)))
}

function serieBisHint(form) {
  if (!form.datum) return t('Höchstens ein Jahr ab dem ersten Termin.')
  return t('Höchstens ein Jahr – ohne Angabe bis {date}.', { date: formatDateLong(maxSerieBis(form.datum)) })
}

// Anlegen und Bearbeiten eines Termins oder einer ganzen Serie (Phase V4a, PartnerTermineEditor). today: "heute" in
// Berliner Ortszeit vom Server (GET /partner-area/termine heute). Gespeichert wird ohne Freigabe - der Server antwortet
// mit der ganzen Liste (onSaved). Fehler vom Server stehen am passenden Feld (terminErrorField), sonst oben.
export default function TerminForm({ termin, today, onSaved, onCancel }) {
  const [form, setForm] = useState(() => initialTerminForm(termin))
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const { formRef, bannerRef, focusFirstError } = useFocusFirstError()
  const isSerie = form.serie !== SERIE.keine
  const submitLabel = isSerie ? t('Serie speichern') : t('Termin speichern')
  const bind = (key, { hint } = {}) => fieldProps(IDS[key], { error: fieldErrors[key], hint })

  function update(patch) {
    setForm((current) => ({ ...current, ...patch }))
    setFieldErrors((current) => withoutKeys(current, Object.keys(patch)))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    const clientErrors = terminClientErrors(form, { today, existingDatum: termin?.datum ?? null })
    setFieldErrors(clientErrors)
    if (Object.keys(clientErrors).length) {
      focusFirstError()
      return
    }
    setSaving(true)
    try {
      const payload = toTerminPayload(form)
      const saved = termin ? await api.partnerArea.updateTermin(termin.id, payload) : await api.partnerArea.createTermin(payload)
      onSaved(saved, { created: !termin })
    } catch (err) {
      const field = terminErrorField(err.message)
      if (field) setFieldErrors({ [field]: err.message })
      else setError(err.message)
      setSaving(false)
      focusFirstError()
    }
  }

  return (
    <form ref={formRef} className="termin-form card form-stack" onSubmit={handleSubmit} noValidate>
      <h3>{termin ? t('Bearbeiten – {title}', { title: termin.titel }) : t('Neuer Termin')}</h3>
      {termin && termin.serie !== SERIE.keine && <p className="field-hint">{t(SERIES_EDIT_HINT)}</p>}
      {error && (
        <div ref={bannerRef} className="error-banner" role="alert" tabIndex={-1}>
          {error}
        </div>
      )}

      <div className="form-grid">
        <AdminField id={IDS.titel} label={t('Titel')} error={fieldErrors.titel} className="span-2">
          <input {...bind('titel')} value={form.titel} onChange={(e) => update({ titel: e.target.value })} maxLength={MAX_TITEL_LENGTH} required />
        </AdminField>

        <AdminField id={IDS.datum} label={isSerie ? t('Erster Termin') : t('Datum')} error={fieldErrors.datum}>
          <input {...bind('datum')} type="date" value={form.datum} min={termin ? undefined : today} max={today ? maxSerieBis(today) : undefined} onChange={(e) => update({ datum: e.target.value })} required />
        </AdminField>

        <div className="termin-form-times">
          <AdminField id={IDS.uhrzeit} label={t('Beginn')} error={fieldErrors.uhrzeit}>
            <input {...bind('uhrzeit')} type="time" value={form.uhrzeit} onChange={(e) => update({ uhrzeit: e.target.value })} required />
          </AdminField>
          <AdminField id={IDS.ende} label={t('Ende (optional)')} error={fieldErrors.ende}>
            <input {...bind('ende')} type="time" value={form.ende} onChange={(e) => update({ ende: e.target.value })} />
          </AdminField>
        </div>

        <AdminField
          id={IDS.serie}
          label={t('Wiederholen')}
          hint={serieSkipsMonths(form.serie, form.datum) ? t(SKIP_HINT) : undefined}
          error={fieldErrors.serie}
        >
          <select {...bind('serie', { hint: serieSkipsMonths(form.serie, form.datum) })} value={form.serie} onChange={(e) => update({ serie: e.target.value })}>
            {serieOptions(form.datum).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </AdminField>

        {isSerie && (
          <AdminField id={IDS.serieBis} label={t('Wiederholen bis (optional)')} hint={serieBisHint(form)} error={fieldErrors.serieBis}>
            <input
              {...bind('serieBis', { hint: true })}
              type="date"
              value={form.serieBis}
              min={form.datum || undefined}
              max={form.datum ? maxSerieBis(form.datum) : undefined}
              onChange={(e) => update({ serieBis: e.target.value })}
            />
          </AdminField>
        )}

        <AdminField id={IDS.ort} label={t('Ort (optional)')} error={fieldErrors.ort} className="span-2">
          <input {...bind('ort')} value={form.ort} onChange={(e) => update({ ort: e.target.value })} maxLength={MAX_ORT_LENGTH} placeholder={t('z. B. Trainingsplatz am Deich')} />
        </AdminField>

        <AdminField id={IDS.text} label={t('Text (optional)')} hint={t('{n} / {max} Zeichen', { n: form.text.length, max: MAX_TEXT_LENGTH })} error={fieldErrors.text} className="span-2">
          <textarea {...bind('text', { hint: true })} value={form.text} onChange={(e) => update({ text: e.target.value })} maxLength={MAX_TEXT_LENGTH} rows={3} />
        </AdminField>
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {t('Abbrechen')}
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? t('Speichere …') : submitLabel}
        </button>
      </div>
    </form>
  )
}
