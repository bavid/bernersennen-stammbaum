import { useState } from 'react'
import { Button } from './ui'
import AdminField, { fieldProps } from './AdminField.jsx'
import { t } from '../lib/i18n/index.js'

const EMPTY = { slug: '', ziel: '/', serie: '' }
const IDS = { slug: 'landeadresse-slug', ziel: 'landeadresse-ziel', serie: 'landeadresse-serie' }

// Neue Landeadresse anlegen (AdminLandeadressen.jsx): Kurzname, Ziel in der App, optionale Code-Serie. Fehler des Servers
// mit details.feld landen direkt am Feld (server/lib/landeadressenRegeln.js).
export default function AdminLandeadresseForm({ onCreate }) {
  const [form, setForm] = useState(EMPTY)
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const update = (patch) => setForm((prev) => ({ ...prev, ...patch }))

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setFieldErrors({})
    try {
      await onCreate({ slug: form.slug.trim(), ziel: form.ziel.trim(), serie: form.serie.trim() })
      setForm(EMPTY)
    } catch (err) {
      const feld = err.details?.feld
      if (feld && IDS[feld]) setFieldErrors({ [feld]: err.message })
      else setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit} noValidate>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <div className="form-grid">
        <AdminField id={IDS.slug} label={t('Kurzname')} error={fieldErrors.slug} hint={t('2–30 Zeichen: a–z, 0–9, Bindestrich – z. B. fb oder anzeige-herbst.')}>
          <input
            {...fieldProps(IDS.slug, { error: fieldErrors.slug, hint: true })}
            value={form.slug}
            maxLength={30}
            autoComplete="off"
            onChange={(e) => update({ slug: e.target.value })}
            required
          />
        </AdminField>
        <AdminField id={IDS.ziel} label={t('Ziel in der App')} error={fieldErrors.ziel} hint={t('z. B. / oder /partner-werden')}>
          <input
            {...fieldProps(IDS.ziel, { error: fieldErrors.ziel, hint: true })}
            value={form.ziel}
            maxLength={200}
            autoComplete="off"
            onChange={(e) => update({ ziel: e.target.value })}
          />
        </AdminField>
        <AdminField id={IDS.serie} label={t('Code-Serie (optional)')} error={fieldErrors.serie} hint={t('z. B. FB – zeigt die eingelösten Codes der Stapel „FB-…“ daneben.')}>
          <input
            {...fieldProps(IDS.serie, { error: fieldErrors.serie, hint: true })}
            value={form.serie}
            maxLength={8}
            autoComplete="off"
            onChange={(e) => update({ serie: e.target.value })}
          />
        </AdminField>
      </div>
      <div className="form-actions">
        <Button type="submit" disabled={saving || form.slug.trim() === ''}>
          {t('Landeadresse anlegen')}
        </Button>
      </div>
    </form>
  )
}
