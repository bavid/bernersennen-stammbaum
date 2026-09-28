import { useState } from 'react'
import { api } from '../api'
import AdminImageUpload from './AdminImageUpload.jsx'
import AdminPromotionFields from './AdminPromotionFields.jsx'
import useFocusFirstError from '../hooks/useFocusFirstError.js'
import { initialPromotionForm, promotionClientErrors, promotionErrorField, toPromotionPayload } from '../lib/adminMarketing.js'

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

  const { formRef, bannerRef, focusFirstError } = useFocusFirstError()

  function update(patch) {
    setForm((current) => ({ ...current, ...patch }))
    setFieldErrors((current) => withoutKeys(current, Object.keys(patch)))
  }

  // Ein "Pflicht"-Fehler an "Empfohlen von" gilt nur für eine Empfehlung - beim Umstellen verschwindet er.
  function changeKennzeichnung(kennzeichnung) {
    setForm((current) => ({ ...current, kennzeichnung }))
    setFieldErrors((current) => withoutKeys(current, ['kennzeichnung', 'empfohlenVon']))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    const clientErrors = promotionClientErrors(form)
    setFieldErrors(clientErrors)
    if (Object.keys(clientErrors).length) {
      focusFirstError()
      return
    }

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
      focusFirstError()
    }
  }

  return (
    <form ref={formRef} className="admin-promo-form form-stack" onSubmit={handleSubmit} noValidate>
      <h3>{promotion ? `Bearbeiten – ${promotion.titel}` : 'Empfehlung oder Anzeige anlegen'}</h3>
      {error && (
        <div ref={bannerRef} className="error-banner" role="alert" tabIndex={-1}>
          {error}
        </div>
      )}

      <AdminPromotionFields
        form={form}
        fieldErrors={fieldErrors}
        partners={partners}
        update={update}
        onKennzeichnungChange={changeKennzeichnung}
      />

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
