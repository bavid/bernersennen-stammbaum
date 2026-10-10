import { useState } from 'react'
import { api } from '../api'
import useFocusFirstError from '../hooks/useFocusFirstError.js'
import AdminField, { fieldProps } from './AdminField.jsx'
import AdminImageUpload from './AdminImageUpload.jsx'
import Icon from './Icon.jsx'
import PostZeitraeumeField from './PostZeitraeumeField.jsx'
import {
  EDIT_MODES,
  IMAGE_LATER_HINT,
  MAX_TEXT_LENGTH,
  MAX_TITEL_LENGTH,
  MAX_URL_LENGTH,
  POST_BEREICH_LABELS,
  allowedBereiche,
  editMode,
  initialPostForm,
  postClientErrors,
  postErrorField,
  toPostPayload
} from '../lib/partnerPosts.js'
import { t } from '../lib/i18n/index.js'
import { Button } from './ui/index.js'

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
const IMAGE_HINT_LIVE = 'JPG oder PNG, höchstens 512 KB – auch ein neues Bild geht sofort online.'

function withoutKeys(object, keys) {
  return Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)))
}

// Anlegen und Bearbeiten eines eigenen Beitrags (Phase P2). Bereich nur aus den für den Partner-Typ
// erlaubten Werten (bei genau einem schon gewählt). Das Bild gibt es erst für einen gespeicherten Beitrag
// - wie im Admin-Formular (AdminPromotionForm); onChanged meldet den vom Bild-Upload zurückgesetzten
// Beitrag an die Liste. Fehler vom Server stehen am passenden Feld (postErrorField), sonst oben.
// V-Fehler 3: Hinweis und Knopf sagen, was Speichern bewirkt (lib/partnerPosts.js editMode) - bei einem abgelehnten
// Beitrag steht der Grund gleich oben und der Knopf heißt "Erneut einreichen"; bei vertrauenswürdigen Partnern
// (vertrauenswuerdig) gehen Änderungen an freigegebenen Beiträgen sofort online.
export default function PartnerPostForm({ post, typ, vertrauenswuerdig = false, onSaved, onChanged, onCancel }) {
  const [form, setForm] = useState(() => initialPostForm(post, typ))
  const [bildUrl, setBildUrl] = useState(post?.bildUrl || null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const { formRef, bannerRef, focusFirstError } = useFocusFirstError()
  const bereiche = allowedBereiche(typ)
  const mode = editMode(post, vertrauenswuerdig)
  const hint = t(EDIT_MODES[mode].hint)
  const submit = t(EDIT_MODES[mode].submit)
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
      <h3>{post ? t('Bearbeiten – {title}', { title: post.titel }) : t('Neuer Beitrag')}</h3>
      {mode === 'abgelehnt' && post.ablehnungsgrund && (
        <div className="partner-post-rejected" role="note">
          <Icon name="alert" />
          <p>
            <strong>{t('Abgelehnt')}</strong> – {post.ablehnungsgrund}
          </p>
        </div>
      )}
      <p className={post ? 'partner-post-resubmit' : 'field-hint'}>{hint}</p>
      {error && (
        <div ref={bannerRef} className="error-banner" role="alert" tabIndex={-1}>
          {error}
        </div>
      )}

      <div className="form-grid">
        <AdminField id={IDS.titel} label={t('Titel')} error={fieldErrors.titel} className="span-2">
          <input {...bind('titel')} value={form.titel} onChange={(e) => update({ titel: e.target.value })} maxLength={MAX_TITEL_LENGTH} required />
        </AdminField>

        <AdminField id={IDS.text} label={t('Text (optional)')} hint={t('{n} / {max} Zeichen', { n: form.text.length, max: MAX_TEXT_LENGTH })} error={fieldErrors.text} className="span-2">
          <textarea {...bind('text', { hint: true })} value={form.text} onChange={(e) => update({ text: e.target.value })} maxLength={MAX_TEXT_LENGTH} rows={4} />
        </AdminField>

        <AdminField id={IDS.bereich} label={t('Erscheint in „Entdecken“ unter')} error={fieldErrors.bereich}>
          <select {...bind('bereich')} value={form.bereich} onChange={(e) => update({ bereich: e.target.value })}>
            {bereiche.length !== 1 && <option value="">{t('Bitte wählen')}</option>}
            {bereiche.map((value) => (
              <option key={value} value={value}>
                {POST_BEREICH_LABELS[value] ? t(POST_BEREICH_LABELS[value]) : value}
              </option>
            ))}
          </select>
        </AdminField>

        <AdminField id={IDS.url} label={t('Link (optional)')} error={fieldErrors.url}>
          <input {...bind('url')} type="url" value={form.url} onChange={(e) => update({ url: e.target.value })} maxLength={MAX_URL_LENGTH} placeholder="https://…" />
        </AdminField>

        <AdminField id={IDS.start} label={t('Sichtbar ab (optional)')} error={fieldErrors.start}>
          <input {...bind('start')} type="date" value={form.start} onChange={(e) => update({ start: e.target.value })} />
        </AdminField>

        <AdminField id={IDS.ende} label={t('Sichtbar bis (optional)')} error={fieldErrors.ende}>
          <input {...bind('ende')} type="date" value={form.ende} onChange={(e) => update({ ende: e.target.value })} />
        </AdminField>

        <PostZeitraeumeField rows={form.zeitraeume} error={fieldErrors.zeitraeume} onChange={(zeitraeume) => update({ zeitraeume })} />

        <div className="field span-2">
          <label className="check">
            <input id="post-aktiv" type="checkbox" checked={form.aktiv} onChange={(e) => update({ aktiv: e.target.checked })} />
            {t('Aktiv (nach der Freigabe sichtbar)')}
          </label>
        </div>
      </div>

      {post ? (
        <AdminImageUpload
          label={t('Bild')}
          buttonLabel={t('Bild hochladen')}
          imageUrl={bildUrl}
          previewClassName="admin-upload-preview-wide"
          accept={IMAGE_ACCEPT}
          hint={t(mode === 'sofort' ? IMAGE_HINT_LIVE : IMAGE_HINT)}
          upload={uploadImage}
          onUploaded={setBildUrl}
        />
      ) : (
        <p className="field-hint">{t(IMAGE_LATER_HINT)}</p>
      )}

      <div className="form-actions">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('Abbrechen')}
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? t('Speichere …') : submit}
        </Button>
      </div>
    </form>
  )
}
