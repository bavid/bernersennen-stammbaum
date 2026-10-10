import { useState } from 'react'
import { api } from '../api'
import AdminImageUpload from './AdminImageUpload.jsx'
import ColorField from './ColorField.jsx'
import { STATUS_LABELS, initialState, toPayload } from '../lib/adminPartnerForm.js'
import { TYPE_LABELS } from '../lib/partnerTypes.js'
import { Button } from './ui/index.js'

// Logo nur für einen bereits gespeicherten Partner (Server braucht die id) - lib/partners.js prüft
// PNG/JPG/WebP; Upload-Knopf und Tastaturbedienung teilt es mit dem Bild einer Empfehlung.
function LogoUpload({ partnerId, logoUrl, onUploaded }) {
  return (
    <AdminImageUpload
      label="Logo"
      buttonLabel="Logo hochladen"
      imageUrl={logoUrl}
      upload={async (file) => (await api.admin.uploadPartnerLogo(partnerId, file)).logoUrl}
      onUploaded={onUploaded}
    />
  )
}

// Anlegen und Bearbeiten eines Partners - alle Felder aus server/lib/partners.js validatePartner.
// Logo-Upload nur, wenn partner schon eine id hat (siehe LogoUpload).
export default function AdminPartnerForm({ partner, onSaved, onCancel }) {
  const [form, setForm] = useState(() => initialState(partner))
  const [logoUrl, setLogoUrl] = useState(partner?.logo_file ? `/partner-media/${partner.logo_file}` : null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const update = (patch) => setForm((current) => ({ ...current, ...patch }))

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const payload = toPayload(form)
      const saved = partner ? await api.admin.updatePartner(partner.id, payload) : await api.admin.createPartner(payload)
      onSaved(saved)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form className="admin-partner-form form-stack" onSubmit={handleSubmit}>
      <h3>{partner ? `Partner bearbeiten – ${partner.name}` : 'Partner anlegen'}</h3>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <div className="form-grid">
        <div className="field">
          <label className="field-label" htmlFor="admin-partner-name">
            Name
          </label>
          <input id="admin-partner-name" value={form.name} onChange={(e) => update({ name: e.target.value })} maxLength={120} required />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="admin-partner-slug">
            Kurzname (URL, optional)
          </label>
          <input
            id="admin-partner-slug"
            value={form.slug}
            onChange={(e) => update({ slug: e.target.value })}
            placeholder="aus dem Namen erzeugt"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="admin-partner-typ">
            Typ
          </label>
          <select id="admin-partner-typ" value={form.typ} onChange={(e) => update({ typ: e.target.value })}>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="admin-partner-status">
            Status
          </label>
          <select id="admin-partner-status" value={form.status} onChange={(e) => update({ status: e.target.value })}>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="admin-partner-plz">
            Postleitzahl
          </label>
          <input
            id="admin-partner-plz"
            value={form.plz}
            onChange={(e) => update({ plz: e.target.value.replace(/\D/g, '').slice(0, 5) })}
            inputMode="numeric"
            maxLength={5}
          />
        </div>
        <div className="field admin-partner-checkbox-field">
          <label className="check">
            <input type="checkbox" checked={form.istPartner} onChange={(e) => update({ istPartner: e.target.checked })} />
            Partner-Kennzeichnung (sonst „geprüft“)
          </label>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="admin-partner-website">
            Website
          </label>
          <input
            id="admin-partner-website"
            type="url"
            value={form.website}
            onChange={(e) => update({ website: e.target.value })}
            placeholder="https://…"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="admin-partner-spenden-url">
            Spenden-Link
          </label>
          <input
            id="admin-partner-spenden-url"
            type="url"
            value={form.spendenUrl}
            onChange={(e) => update({ spendenUrl: e.target.value })}
            placeholder="https://…"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="admin-partner-vermittlung-url">
            Vermittlungs-Link
          </label>
          <input
            id="admin-partner-vermittlung-url"
            type="url"
            value={form.vermittlungUrl}
            onChange={(e) => update({ vermittlungUrl: e.target.value })}
            placeholder="https://…"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="admin-partner-kontakt-email">
            Kontakt-E-Mail
          </label>
          <input
            id="admin-partner-kontakt-email"
            type="email"
            value={form.kontaktEmail}
            onChange={(e) => update({ kontaktEmail: e.target.value })}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="admin-partner-kontakt-telefon">
            Kontakt-Telefon
          </label>
          <input
            id="admin-partner-kontakt-telefon"
            value={form.kontaktTelefon}
            onChange={(e) => update({ kontaktTelefon: e.target.value })}
          />
        </div>
        <div className="field span-2">
          <label className="field-label" htmlFor="admin-partner-ansprechperson">
            Ansprechperson (pflegt der Partner selbst)
          </label>
          <input
            id="admin-partner-ansprechperson"
            value={form.ansprechperson}
            onChange={(e) => update({ ansprechperson: e.target.value })}
            maxLength={80}
          />
        </div>
        <div className="field span-2">
          <label className="field-label" htmlFor="admin-partner-portal-titel">
            Portal-Titel
          </label>
          <input
            id="admin-partner-portal-titel"
            value={form.portalTitel}
            onChange={(e) => update({ portalTitel: e.target.value })}
            maxLength={120}
            placeholder={`Willkommen von ${form.name || '…'}`}
          />
        </div>
        <div className="field span-2">
          <label className="field-label" htmlFor="admin-partner-portal-text">
            Portal-Text
          </label>
          <textarea
            id="admin-partner-portal-text"
            value={form.portalText}
            onChange={(e) => update({ portalText: e.target.value })}
            maxLength={2000}
            rows={4}
          />
        </div>
        <ColorField
          id="admin-partner-farbe-text"
          label="Akzentfarbe"
          className="span-2"
          value={form.farbe}
          onChange={(farbe) => update({ farbe })}
        />
      </div>

      {partner && <LogoUpload partnerId={partner.id} logoUrl={logoUrl} onUploaded={setLogoUrl} />}

      <div className="form-actions">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button type="submit" disabled={saving || !form.name.trim()}>
          {saving ? 'Speichere …' : 'Speichern'}
        </Button>
      </div>
    </form>
  )
}
