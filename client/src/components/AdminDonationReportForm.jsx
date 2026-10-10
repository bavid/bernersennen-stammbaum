import { useState } from 'react'
import { api } from '../api'
import AdminField, { fieldProps } from './AdminField.jsx'
import useFocusFirstError from '../hooks/useFocusFirstError.js'
import { AMOUNT_FIELDS, donationErrorField, initialDonationForm, parseDonationForm } from '../lib/adminMarketing.js'
import { formatEuroCents } from '../lib/discover.js'
import { parseEuroToCents } from '../lib/euro.js'
import { Button } from './ui/index.js'

const IDS = {
  zeitraum: 'admin-report-zeitraum',
  eingang: 'admin-report-eingang',
  kosten: 'admin-report-kosten',
  weitergeleitet: 'admin-report-weitergeleitet',
  empfaenger: 'admin-report-empfaenger',
  nachweisUrl: 'admin-report-nachweis'
}

// Zeigt beim Tippen, wie der Betrag verstanden wird ("= 1.250,50 €") - Tausenderpunkt und Dezimalkomma
// sind sonst leicht zu verwechseln.
function amountHint(value) {
  if (!value.trim()) return 'Euro, z. B. 1.250,50'
  const cents = parseEuroToCents(value)
  return cents === null ? 'Kein gültiger Betrag' : `= ${formatEuroCents(cents)}`
}

// Anlegen und Bearbeiten eines Spendenberichts: Beträge in Euro eintippen, gesendet werden ganze Cent
// (server/lib/promotions.js validateDonationReport). Fehler stehen am Feld, sonst oben.
export default function AdminDonationReportForm({ report, onSaved, onCancel }) {
  const [form, setForm] = useState(() => initialDonationForm(report))
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const { formRef, bannerRef, focusFirstError } = useFocusFirstError()

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => Object.fromEntries(Object.entries(current).filter(([field]) => field !== key)))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    const { payload, errors } = parseDonationForm(form)
    setFieldErrors(errors)
    if (!payload) {
      focusFirstError()
      return
    }

    setSaving(true)
    try {
      const saved = report ? await api.admin.updateDonationReport(report.id, payload) : await api.admin.createDonationReport(payload)
      onSaved(saved)
    } catch (err) {
      const field = donationErrorField(err.message)
      if (field) setFieldErrors({ [field]: err.message })
      else setError(err.message)
      setSaving(false)
      focusFirstError()
    }
  }

  const bind = (key, hint) => fieldProps(IDS[key], { error: fieldErrors[key], hint })

  return (
    <form ref={formRef} className="admin-report-form form-stack" onSubmit={handleSubmit} noValidate>
      <h3>{report ? `Spendenbericht bearbeiten – ${report.zeitraum}` : 'Spendenbericht anlegen'}</h3>
      {error && (
        <div ref={bannerRef} className="error-banner" role="alert" tabIndex={-1}>
          {error}
        </div>
      )}

      <div className="form-grid">
        <AdminField id={IDS.zeitraum} label="Zeitraum" error={fieldErrors.zeitraum} hint="z. B. 2026 Q3 oder Juli–September 2026">
          <input {...bind('zeitraum', true)} value={form.zeitraum} onChange={(e) => update('zeitraum', e.target.value)} maxLength={40} required />
        </AdminField>
        <AdminField id={IDS.empfaenger} label="Empfänger (optional)" error={fieldErrors.empfaenger}>
          <input {...bind('empfaenger')} value={form.empfaenger} onChange={(e) => update('empfaenger', e.target.value)} maxLength={120} />
        </AdminField>

        {AMOUNT_FIELDS.map((field) => (
          <AdminField key={field.key} id={IDS[field.key]} label={field.label} error={fieldErrors[field.key]} hint={amountHint(form[field.key])}>
            <input
              {...bind(field.key, true)}
              value={form[field.key]}
              onChange={(e) => update(field.key, e.target.value)}
              inputMode="decimal"
              autoComplete="off"
              required
            />
          </AdminField>
        ))}

        <AdminField id={IDS.nachweisUrl} label="Nachweis-Link (optional)" error={fieldErrors.nachweisUrl} className="span-2">
          <input
            {...bind('nachweisUrl')}
            type="url"
            value={form.nachweisUrl}
            onChange={(e) => update('nachweisUrl', e.target.value)}
            placeholder="https://…"
          />
        </AdminField>
      </div>

      <div className="form-actions">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Speichere …' : 'Speichern'}
        </Button>
      </div>
    </form>
  )
}
