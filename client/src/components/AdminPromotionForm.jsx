import { useState } from 'react'
import { api } from '../api'
import AdminField, { fieldProps } from './AdminField.jsx'
import AdminImageUpload from './AdminImageUpload.jsx'
import {
  BEREICH_LABELS,
  EMPFEHLUNG_HINT,
  FUTTER_HINT,
  KENNZEICHNUNGEN,
  TIERART_LABELS,
  initialPromotionForm,
  promotionClientErrors,
  promotionErrorField,
  toPromotionPayload
} from '../lib/adminMarketing.js'

const IDS = {
  titel: 'admin-promo-titel',
  bereich: 'admin-promo-bereich',
  kennzeichnung: 'admin-promo-kennzeichnung',
  empfohlenVon: 'admin-promo-empfohlen-von',
  partnerId: 'admin-promo-partner',
  text: 'admin-promo-text',
  url: 'admin-promo-url',
  tierart: 'admin-promo-tierart',
  sort: 'admin-promo-sort',
  start: 'admin-promo-start',
  ende: 'admin-promo-ende'
}

const PARTNER_STATUS_SUFFIX = { entwurf: ' (Entwurf)', pausiert: ' (pausiert)' }
const LEGAL_HINT_CLASS = 'admin-legal-hint'

function withoutKeys(object, keys) {
  return Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)))
}

// Anlegen und Bearbeiten einer Empfehlung/Anzeige - alle Felder aus server/lib/promotions.js
// validatePromotion. Fehler vom Server stehen am passenden Feld (promotionErrorField), sonst oben.
// Das Bild gibt es erst für eine gespeicherte Empfehlung (der Upload braucht die id) - wie beim Partner-Logo.
// onImageUploaded: das Bild ist sofort gespeichert (eigener Endpunkt) - auch wenn danach "Abbrechen" kommt.
export default function AdminPromotionForm({ promotion, partners = [], onSaved, onCancel, onImageUploaded }) {
  const [form, setForm] = useState(() => initialPromotionForm(promotion))
  const [bildUrl, setBildUrl] = useState(promotion?.bildUrl || null)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const isEmpfehlung = form.kennzeichnung === 'Empfehlung'
  const isFutter = form.bereich === 'futter'

  function update(patch) {
    setForm((current) => ({ ...current, ...patch }))
    setFieldErrors((current) => withoutKeys(current, Object.keys(patch)))
  }

  // Ein "Pflicht"-Fehler an "Empfohlen von" gilt nur für eine Empfehlung - beim Umstellen verschwindet er.
  function changeKennzeichnung(kennzeichnung) {
    setForm((current) => ({ ...current, kennzeichnung }))
    setFieldErrors((current) => withoutKeys(current, ['kennzeichnung', 'empfohlenVon']))
  }

  const bind = (key, { hint } = {}) => fieldProps(IDS[key], { error: fieldErrors[key], hint })

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    const clientErrors = promotionClientErrors(form)
    setFieldErrors(clientErrors)
    if (Object.keys(clientErrors).length) return

    setSaving(true)
    try {
      const payload = toPromotionPayload(form)
      const saved = promotion ? await api.admin.updatePromotion(promotion.id, payload) : await api.admin.createPromotion(payload)
      onSaved(saved)
    } catch (err) {
      const field = promotionErrorField(err.message)
      if (field) setFieldErrors({ [field]: err.message })
      else setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form className="admin-promo-form form-stack" onSubmit={handleSubmit} noValidate>
      <h3>{promotion ? `Bearbeiten – ${promotion.titel}` : 'Empfehlung oder Anzeige anlegen'}</h3>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <div className="form-grid">
        <AdminField id={IDS.titel} label="Titel" error={fieldErrors.titel} className="span-2">
          <input {...bind('titel')} value={form.titel} onChange={(e) => update({ titel: e.target.value })} maxLength={120} required />
        </AdminField>

        <AdminField id={IDS.bereich} label="Bereich" error={fieldErrors.bereich}>
          <select {...bind('bereich')} value={form.bereich} onChange={(e) => update({ bereich: e.target.value })}>
            {Object.entries(BEREICH_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </AdminField>

        <AdminField
          id={IDS.kennzeichnung}
          label="Kennzeichnung"
          error={fieldErrors.kennzeichnung}
          hint={isEmpfehlung ? EMPFEHLUNG_HINT : null}
          hintClassName={LEGAL_HINT_CLASS}
        >
          <select
            {...bind('kennzeichnung', { hint: isEmpfehlung })}
            value={form.kennzeichnung}
            onChange={(e) => changeKennzeichnung(e.target.value)}
          >
            {KENNZEICHNUNGEN.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </AdminField>

        <AdminField id={IDS.empfohlenVon} label={isEmpfehlung ? 'Empfohlen von (Pflicht)' : 'Empfohlen von (optional)'} error={fieldErrors.empfohlenVon}>
          <input
            {...bind('empfohlenVon')}
            value={form.empfohlenVon}
            onChange={(e) => update({ empfohlenVon: e.target.value })}
            maxLength={120}
            required={isEmpfehlung}
            placeholder="z. B. Tierheim Sonnenhang"
          />
        </AdminField>

        <AdminField id={IDS.partnerId} label="Partner (optional)" error={fieldErrors.partnerId}>
          <select {...bind('partnerId')} value={form.partnerId} onChange={(e) => update({ partnerId: e.target.value })}>
            <option value="">Kein Partner</option>
            {partners.map((partner) => (
              <option key={partner.id} value={String(partner.id)}>
                {partner.name}
                {PARTNER_STATUS_SUFFIX[partner.status] || ''}
              </option>
            ))}
          </select>
        </AdminField>

        <AdminField
          id={IDS.text}
          label="Text (optional)"
          error={fieldErrors.text}
          hint={isFutter ? FUTTER_HINT : null}
          hintClassName={LEGAL_HINT_CLASS}
          className="span-2"
        >
          <textarea {...bind('text', { hint: isFutter })} value={form.text} onChange={(e) => update({ text: e.target.value })} maxLength={600} rows={3} />
        </AdminField>

        <AdminField id={IDS.url} label="Link (optional)" error={fieldErrors.url} className="span-2">
          <input {...bind('url')} type="url" value={form.url} onChange={(e) => update({ url: e.target.value })} placeholder="https://…" />
        </AdminField>

        <AdminField id={IDS.tierart} label="Tierart" error={fieldErrors.tierart}>
          <select {...bind('tierart')} value={form.tierart} onChange={(e) => update({ tierart: e.target.value })}>
            <option value="">Alle Tierarten</option>
            {Object.entries(TIERART_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </AdminField>

        <AdminField id={IDS.sort} label="Reihenfolge" error={fieldErrors.sort} hint="Kleinere Zahl steht weiter oben.">
          <input {...bind('sort', { hint: true })} type="number" step={1} value={form.sort} onChange={(e) => update({ sort: e.target.value })} />
        </AdminField>

        <AdminField id={IDS.start} label="Sichtbar ab (optional)" error={fieldErrors.start}>
          <input {...bind('start')} type="date" value={form.start} onChange={(e) => update({ start: e.target.value })} />
        </AdminField>

        <AdminField id={IDS.ende} label="Sichtbar bis (optional)" error={fieldErrors.ende}>
          <input {...bind('ende')} type="date" value={form.ende} onChange={(e) => update({ ende: e.target.value })} />
        </AdminField>

        <div className="field span-2">
          <label className="check">
            <input id="admin-promo-aktiv" type="checkbox" checked={form.aktiv} onChange={(e) => update({ aktiv: e.target.checked })} />
            Aktiv (im Reiter „Entdecken“ sichtbar)
          </label>
        </div>
      </div>

      {promotion ? (
        <AdminImageUpload
          label="Bild"
          buttonLabel="Bild hochladen"
          imageUrl={bildUrl}
          previewClassName="admin-upload-preview-wide"
          upload={async (file) => (await api.admin.uploadPromotionImage(promotion.id, file)).bildUrl}
          onUploaded={(url) => {
            setBildUrl(url)
            onImageUploaded?.()
          }}
        />
      ) : (
        <p className="field-hint">Ein Bild kannst du nach dem Speichern über „Bearbeiten“ hochladen.</p>
      )}

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
