import { useEffect, useState } from 'react'
import { api } from '../api'
import AdminField, { fieldProps } from './AdminField.jsx'
import AdminDonationReports from './AdminDonationReports.jsx'
import useFocusFirstError from '../hooks/useFocusFirstError.js'
import { settingsError } from '../lib/adminMarketing.js'
import { Button } from './ui/index.js'

const GOFUNDME_ID = 'admin-support-gofundme'
const TEXT_ID = 'admin-support-text'
const MAX_TEXT_LENGTH = 600 // wie server/routes/adminMarketing.js MAX_SETTINGS_TEXT_LENGTH

function fromSettings(settings) {
  return { gofundmeUrl: settings?.gofundme_url || '', text: settings?.unterstuetzen_text || '' }
}

// GoFundMe-Link und Text für "Unterstützen" (GET/PUT /api/admin/settings). Gesendet werden nur die echten
// Schlüssel - die demo_*-Pendants pflegt der Demo-Pack-Aufbau selbst. Der Server normalisiert die Adresse
// (z. B. https:// davor), das Feld zeigt danach seinen Wert.
function SupportSettings() {
  const [form, setForm] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const { formRef, bannerRef, focusFirstError } = useFocusFirstError()

  useEffect(() => {
    api.admin
      .settings()
      .then((settings) => setForm(fromSettings(settings)))
      .catch((err) => setLoadError(err.message))
  }, [])

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => Object.fromEntries(Object.entries(current).filter(([field]) => field !== key)))
    setSaved(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    setSaved(false)
    setSaving(true)
    try {
      const next = await api.admin.updateSettings({ gofundme_url: form.gofundmeUrl.trim(), unterstuetzen_text: form.text })
      setForm(fromSettings(next))
      setSaved(true)
    } catch (err) {
      const mapped = settingsError(err.message)
      if (mapped) setFieldErrors({ [mapped.field]: mapped.message })
      else setError(err.message)
      focusFirstError()
    } finally {
      setSaving(false)
    }
  }

  if (loadError) {
    return (
      <div className="error-banner" role="alert">
        {loadError}
      </div>
    )
  }
  if (!form) return <p className="muted">Lade …</p>

  return (
    <form ref={formRef} className="admin-support-settings admin-support-block form-stack" onSubmit={handleSubmit} noValidate>
      <h3>GoFundMe und Text</h3>
      {error && (
        <div ref={bannerRef} className="error-banner" role="alert" tabIndex={-1}>
          {error}
        </div>
      )}
      <div className="form-grid">
        <AdminField
          id={GOFUNDME_ID}
          label="GoFundMe-Link"
          error={fieldErrors.gofundmeUrl}
          hint="Leer lassen, solange es keine Spendenseite gibt – dann erscheint kein Spenden-Knopf."
          className="span-2"
        >
          <input
            {...fieldProps(GOFUNDME_ID, { error: fieldErrors.gofundmeUrl, hint: true })}
            type="url"
            value={form.gofundmeUrl}
            onChange={(e) => update('gofundmeUrl', e.target.value)}
            placeholder="https://…"
          />
        </AdminField>
        <AdminField
          id={TEXT_ID}
          label="Text im Bereich „Unterstützen“"
          error={fieldErrors.text}
          hint={`${form.text.length} / ${MAX_TEXT_LENGTH} Zeichen`}
          className="span-2"
        >
          <textarea
            {...fieldProps(TEXT_ID, { error: fieldErrors.text, hint: true })}
            value={form.text}
            onChange={(e) => update('text', e.target.value)}
            maxLength={MAX_TEXT_LENGTH}
            rows={3}
          />
        </AdminField>
      </div>
      <div className="form-actions">
        {/* Dauerhafte Live-Region: Screenreader lesen "Gespeichert." vor, sobald der Text erscheint. */}
        <p className="field-hint field-hint-success" role="status">
          {saved ? 'Gespeichert.' : ''}
        </p>
        <span className="form-actions-spacer" />
        <Button type="submit" disabled={saving}>
          {saving ? 'Speichere …' : 'Speichern'}
        </Button>
      </div>
    </form>
  )
}

// Admin-Bereich "Unterstützen & Spenden" (Phase 3 Task 5): Einstellungen für den Spenden-Knopf und die
// Transparenzberichte, beides erscheint im Reiter "Entdecken" unter "Unterstützen".
export default function AdminSupport() {
  return (
    <section className="admin-support card" aria-labelledby="admin-support-title">
      <div className="admin-section-head">
        <h2 id="admin-support-title">Unterstützen &amp; Spenden</h2>
      </div>
      <p className="admin-section-intro muted">
        Spenden-Knopf, Text und Transparenzberichte für den Bereich „Unterstützen“ im Reiter „Entdecken“.
      </p>
      <SupportSettings />
      <AdminDonationReports />
    </section>
  )
}
