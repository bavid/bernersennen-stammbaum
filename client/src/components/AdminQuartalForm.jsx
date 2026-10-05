import { useState } from 'react'
import AdminField, { fieldProps } from './AdminField.jsx'
import useFocusFirstError from '../hooks/useFocusFirstError.js'
import { FINANZIERUNG_LIMITS, QUARTAL_AMOUNTS, QUARTAL_VALUES, quartalForm, quartalPayload, serverFieldError } from '../lib/finanzierung.js'

const ID = 'admin-quartal-'
const id = (key) => `${ID}${key}`

// Phase F: ein Quartal eintragen oder ändern (AdminFinanzierungQuartale). Jahr und Quartal, vier Beträge in Euro (leer = 0)
// und eine Notiz. Fehler stehen am Feld - vom Client (lib/finanzierung.js quartalPayload) wie vom Server (details.feld) -
// und der Fokus springt zum ersten. onSave bekommt die Nutzlast (Cent) und darf werfen; onCancel schließt.
export default function AdminQuartalForm({ quartal, onSave, onCancel }) {
  const [form, setForm] = useState(() => quartalForm(quartal))
  const [errors, setErrors] = useState({})
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const { formRef, bannerRef, focusFirstError } = useFocusFirstError()

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([field]) => field !== key)))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    const { payload, errors: clientErrors } = quartalPayload(form)
    if (!payload) {
      setErrors(clientErrors)
      focusFirstError()
      return
    }
    setSaving(true)
    try {
      await onSave(payload)
    } catch (err) {
      const field = serverFieldError(err)
      if (field) setErrors({ [field.field]: field.message })
      else setError(err.message)
      focusFirstError()
    } finally {
      setSaving(false)
    }
  }

  const bind = (key, hint = false) => fieldProps(id(key), { error: errors[key], hint })

  return (
    <form ref={formRef} className="form-stack admin-quartal-form" onSubmit={handleSubmit} noValidate aria-label={quartal ? 'Quartal ändern' : 'Quartal eintragen'}>
      <h3>{quartal ? 'Quartal ändern' : 'Neues Quartal'}</h3>
      {error && (
        <div ref={bannerRef} className="error-banner" role="alert" tabIndex={-1}>
          {error}
        </div>
      )}
      <div className="form-grid">
        <AdminField id={id('jahr')} label="Jahr" error={errors.jahr}>
          <input {...bind('jahr')} inputMode="numeric" value={form.jahr} onChange={(e) => update('jahr', e.target.value.replace(/\D/g, '').slice(0, 4))} />
        </AdminField>
        <AdminField id={id('quartal')} label="Quartal" error={errors.quartal}>
          <select {...bind('quartal')} value={form.quartal} onChange={(e) => update('quartal', e.target.value)}>
            {QUARTAL_VALUES.map((value) => (
              <option key={value} value={String(value)}>
                {value}. Quartal
              </option>
            ))}
          </select>
        </AdminField>
        {QUARTAL_AMOUNTS.map((field) => (
          <AdminField key={field.key} id={id(field.key)} label={`${field.label} in Euro`} error={errors[field.key]}>
            <input {...bind(field.key)} inputMode="decimal" value={form[field.key]} placeholder="0,00" onChange={(e) => update(field.key, e.target.value)} />
          </AdminField>
        ))}
        <AdminField id={id('notiz')} label="Notiz (optional)" error={errors.notiz} hint={`${form.notiz.length} / ${FINANZIERUNG_LIMITS.notiz} Zeichen · z. B. „Server und Domain“`} className="span-2">
          <input {...bind('notiz', true)} value={form.notiz} maxLength={FINANZIERUNG_LIMITS.notiz} onChange={(e) => update('notiz', e.target.value)} />
        </AdminField>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Speichere …' : 'Speichern'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </form>
  )
}
