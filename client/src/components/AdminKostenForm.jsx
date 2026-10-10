import { useState } from 'react'
import AdminField, { fieldProps } from './AdminField.jsx'
import useFocusFirstError from '../hooks/useFocusFirstError.js'
import { KOSTEN_LIMITS, kostenForm, kostenPayload, kostenServerFieldError } from '../lib/finanzierungRuecklage.js'
import { KATEGORIEN } from '../lib/spendenLive.js'
import { Button } from './ui/index.js'

const ID = 'admin-kosten-'
const id = (key) => `${ID}${key}`

// „Kosten & Reserve“: einen laufenden Kosten-Posten eintragen oder ändern (AdminFinanzierungKosten) - Titel, Betrag in
// Euro, Monat oder Jahr, Beginn, optional Ende und Notiz. Fehler stehen am Feld (Client wie Server), der Fokus springt zum
// ersten. onSave bekommt die Nutzlast (Cent) und darf werfen; onCancel schließt.
export default function AdminKostenForm({ posten, onSave, onCancel }) {
  const [form, setForm] = useState(() => kostenForm(posten))
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
    const { payload, errors: clientErrors } = kostenPayload(form)
    if (!payload) {
      setErrors(clientErrors)
      focusFirstError()
      return
    }
    setSaving(true)
    try {
      await onSave(payload)
    } catch (err) {
      const field = kostenServerFieldError(err)
      if (field) setErrors({ [field.field]: field.message })
      else setError(err.message)
      focusFirstError()
    } finally {
      setSaving(false)
    }
  }

  const bind = (key, hint = false) => fieldProps(id(key), { error: errors[key], hint })
  const title = posten ? 'Posten ändern' : 'Neuer Posten'

  return (
    <form ref={formRef} className="form-stack admin-quartal-form admin-kosten-form" onSubmit={handleSubmit} noValidate aria-label={title}>
      <h3>{title}</h3>
      {error && (
        <div ref={bannerRef} className="error-banner" role="alert" tabIndex={-1}>
          {error}
        </div>
      )}
      <div className="form-grid">
        <AdminField id={id('titel')} label="Titel" error={errors.titel} hint="z. B. „Server“ oder „Domain“">
          <input {...bind('titel', true)} value={form.titel} maxLength={KOSTEN_LIMITS.titel} onChange={(e) => update('titel', e.target.value)} />
        </AdminField>
        <AdminField id={id('betrag')} label="Betrag in Euro" error={errors.betrag}>
          <input {...bind('betrag')} inputMode="decimal" placeholder="0,00" value={form.betrag} onChange={(e) => update('betrag', e.target.value)} />
        </AdminField>
        <AdminField id={id('intervall')} label="Wie oft" error={errors.intervall}>
          <select {...bind('intervall')} value={form.intervall} onChange={(e) => update('intervall', e.target.value)}>
            <option value="monat">jeden Monat</option>
            <option value="jahr">einmal im Jahr</option>
          </select>
        </AdminField>
        <AdminField id={id('kategorie')} label="Kategorie" error={errors.kategorie}>
          <select {...bind('kategorie')} value={form.kategorie} onChange={(e) => update('kategorie', e.target.value)}>
            {KATEGORIEN.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </AdminField>
        <AdminField id={id('ab')} label="Seit" error={errors.ab}>
          <input {...bind('ab')} type="date" value={form.ab} onChange={(e) => update('ab', e.target.value)} />
        </AdminField>
        <AdminField id={id('bis')} label="Bis (optional)" error={errors.bis} hint="leer = läuft weiter">
          <input {...bind('bis', true)} type="date" value={form.bis} onChange={(e) => update('bis', e.target.value)} />
        </AdminField>
        <AdminField id={id('notiz')} label="Notiz (optional, nur hier im Admin)" error={errors.notiz}>
          <input {...bind('notiz')} value={form.notiz} maxLength={KOSTEN_LIMITS.notiz} onChange={(e) => update('notiz', e.target.value)} />
        </AdminField>
      </div>
      <div className="form-actions">
        <Button type="submit" disabled={saving}>
          {saving ? 'Speichere …' : 'Speichern'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </form>
  )
}
