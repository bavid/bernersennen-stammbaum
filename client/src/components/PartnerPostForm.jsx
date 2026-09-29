import { useState } from 'react'
import { api } from '../api'
import useFocusFirstError from '../hooks/useFocusFirstError.js'
import AdminField, { fieldProps } from './AdminField.jsx'
import AdminImageUpload from './AdminImageUpload.jsx'
import {
  IMAGE_LATER_HINT,
  MAX_TEXT_LENGTH,
  MAX_TITEL_LENGTH,
  MAX_URL_LENGTH,
  POST_BEREICH_LABELS,
  RESUBMIT_HINT,
  allowedBereiche,
  initialPostForm,
  postClientErrors,
  postErrorField,
  toPostPayload
} from '../lib/partnerPosts.js'

const IDS = {
  titel: 'post-titel',
  text: 'post-text',
  bereich: 'post-bereich',
  url: 'post-url',
  start: 'post-start',
  ende: 'post-ende'
}

const IMAGE_ACCEPT = 'image/png,image/jpeg'
const IMAGE_HINT = 'JPG oder PNG, höchstens 512 KB – ein neues Bild wird ebenfalls erneut geprüft.'

function withoutKeys(object, keys) {
  return Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)))
}

// Anlegen und Bearbeiten eines eigenen Beitrags (Phase P2). Bereich nur aus den für den Partner-Typ
// erlaubten Werten (bei genau einem schon gewählt). Das Bild gibt es erst für einen gespeicherten Beitrag
// - wie im Admin-Formular (AdminPromotionForm); onChanged meldet den vom Bild-Upload zurückgesetzten
// Beitrag an die Liste. Fehler vom Server stehen am passenden Feld (postErrorField), sonst oben.
export default function PartnerPostForm({ post, typ, onSaved, onChanged, onCancel }) {
  const [form, setForm] = useState(() => initialPostForm(post, typ))
  const [bildUrl, setBildUrl] = useState(post?.bildUrl || null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const { formRef, bannerRef, focusFirstError } = useFocusFirstError()
  const bereiche = allowedBereiche(typ)
  const bind = (key, { hint } = {}) => fieldProps(IDS[key], { error: fieldErrors[key], hint })

  function update(patch) {
    setForm((current) => ({ ...current, ...patch }))
    setFieldErrors((current) => withoutKeys(current, Object.keys(patch)))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    const clientErrors = postClientErrors(form, typ)
    setFieldErrors(clientErrors)
    if (Object.keys(clientErrors).length) {
      focusFirstError()
      return
    }

    setSaving(true)
    try {
      const payload = toPostPayload(form)
      const saved = post ? await api.partnerArea.updatePost(post.id, payload) : await api.partnerArea.createPost(payload)
      onSaved(saved, { created: !post })
    } catch (err) {
      const field = postErrorField(err.message)
      if (field) setFieldErrors({ [field]: err.message })
      else setError(err.message)
      setSaving(false)
      focusFirstError()
    }
  }

  async function uploadImage(file) {
    const saved = await api.partnerArea.uploadPostImage(post.id, file)
    onChanged(saved)
    return saved.bildUrl
  }

  return (
    <form ref={formRef} className="partner-post-form card form-stack" onSubmit={handleSubmit} noValidate>
      <h3>{post ? `Bearbeiten – ${post.titel}` : 'Neuer Beitrag'}</h3>
      <p className={post ? 'partner-post-resubmit' : 'field-hint'}>{post ? RESUBMIT_HINT : 'Der Beitrag erscheint immer als ‚Anzeige‘.'}</p>
      {error && (
        <div ref={bannerRef} className="error-banner" role="alert" tabIndex={-1}>
          {error}
        </div>
      )}

      <div className="form-grid">
        <AdminField id={IDS.titel} label="Titel" error={fieldErrors.titel} className="span-2">
          <input {...bind('titel')} value={form.titel} onChange={(e) => update({ titel: e.target.value })} maxLength={MAX_TITEL_LENGTH} required />
        </AdminField>

        <AdminField id={IDS.text} label="Text (optional)" hint={`${form.text.length} / ${MAX_TEXT_LENGTH} Zeichen`} error={fieldErrors.text} className="span-2">
          <textarea {...bind('text', { hint: true })} value={form.text} onChange={(e) => update({ text: e.target.value })} maxLength={MAX_TEXT_LENGTH} rows={4} />
        </AdminField>

        <AdminField id={IDS.bereich} label="Erscheint in „Entdecken“ unter" error={fieldErrors.bereich}>
          <select {...bind('bereich')} value={form.bereich} onChange={(e) => update({ bereich: e.target.value })}>
            {bereiche.length !== 1 && <option value="">Bitte wählen</option>}
            {bereiche.map((value) => (
              <option key={value} value={value}>
                {POST_BEREICH_LABELS[value] || value}
              </option>
            ))}
          </select>
        </AdminField>

        <AdminField id={IDS.url} label="Link (optional)" error={fieldErrors.url}>
          <input {...bind('url')} type="url" value={form.url} onChange={(e) => update({ url: e.target.value })} maxLength={MAX_URL_LENGTH} placeholder="https://…" />
        </AdminField>

        <AdminField id={IDS.start} label="Sichtbar ab (optional)" error={fieldErrors.start}>
          <input {...bind('start')} type="date" value={form.start} onChange={(e) => update({ start: e.target.value })} />
        </AdminField>

        <AdminField id={IDS.ende} label="Sichtbar bis (optional)" error={fieldErrors.ende}>
          <input {...bind('ende')} type="date" value={form.ende} onChange={(e) => update({ ende: e.target.value })} />
        </AdminField>

        <div className="field span-2">
          <label className="check">
            <input id="post-aktiv" type="checkbox" checked={form.aktiv} onChange={(e) => update({ aktiv: e.target.checked })} />
            Aktiv (nach der Freigabe sichtbar)
          </label>
        </div>
      </div>

      {post ? (
        <AdminImageUpload
          label="Bild"
          buttonLabel="Bild hochladen"
          imageUrl={bildUrl}
          previewClassName="admin-upload-preview-wide"
          accept={IMAGE_ACCEPT}
          hint={IMAGE_HINT}
          upload={uploadImage}
          onUploaded={setBildUrl}
        />
      ) : (
        <p className="field-hint">{IMAGE_LATER_HINT}</p>
      )}

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Speichere …' : 'Speichern und einreichen'}
        </button>
      </div>
    </form>
  )
}
