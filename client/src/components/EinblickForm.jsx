import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import { todayIso } from '../lib/dates.js'
import { downscaleImage } from '../lib/images.js'
import { EINBLICK_ACCEPT, LIMIT_MESSAGE, MAX_EINBLICK_TEXT, TYPE_MESSAGE, isEinblickFileType } from '../lib/einblicke.js'
import Icon from './Icon.jsx'
import { t } from '../lib/i18n/index.js'

// Vorschau des gewählten Fotos als Object-URL - wird beim Wechsel/Entfernen wieder freigegeben. Ohne
// URL.createObjectURL (ältere Umgebungen) gibt es einfach keine Vorschau.
function usePreviewUrl(file) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== 'function') {
      setUrl(null)
      return undefined
    }
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])
  return url
}

// Formular "Neuer Einblick": Foto (nur JPG/PNG, vor dem Upload verkleinert wie Tierfotos), Datum (bis
// heute), Text (bis 300 Zeichen) und die Pflicht-Einwilligung. Absenden erst mit Foto und Einwilligung;
// isFull (60 erreicht) sperrt das Formular. Fehler vom Server stehen im Banner. onCancel (Audit W): das Formular
// öffnet erst auf Wunsch (EinblickeEditor) - "Abbrechen" schließt es wieder.
export default function EinblickForm({ isFull, onCreated, onCancel }) {
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const [file, setFile] = useState(null)
  const [datum, setDatum] = useState(todayIso)
  const [text, setText] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const bannerRef = useRef(null)
  const previewUrl = usePreviewUrl(file)
  const today = todayIso()

  const locked = isDemo || isFull
  const canSubmit = !locked && !saving && Boolean(file) && consent && Boolean(datum)

  useEffect(() => {
    if (error) bannerRef.current?.focus()
  }, [error])

  function handleFile(event) {
    const picked = event.target.files?.[0]
    event.target.value = ''
    if (!picked) return
    if (!isEinblickFileType(picked)) {
      setError(t(TYPE_MESSAGE))
      return
    }
    setError(null)
    setFile(picked)
  }

  function reset() {
    setFile(null)
    setDatum(todayIso())
    setText('')
    setConsent(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!canSubmit) return
    setError(null)
    setSaving(true)
    try {
      const formData = new FormData()
      formData.append('foto', await downscaleImage(file))
      formData.append('datum', datum)
      formData.append('text', text.trim())
      formData.append('einwilligung', 'true')
      const created = await api.partnerArea.createEinblick(formData)
      reset()
      onCreated(created)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="card einblick-form form-stack" onSubmit={handleSubmit} aria-labelledby="einblick-form-title" noValidate>
      <h3 id="einblick-form-title">{t('Neuer Einblick')}</h3>
      {error && (
        <div ref={bannerRef} className="error-banner" role="alert" tabIndex={-1}>
          {error}
        </div>
      )}

      <div className="einblick-form-grid">
        <div className="field einblick-photo-field">
          <span className="field-label">{t('Foto')}</span>
          {previewUrl && <img src={previewUrl} alt={t('Vorschau des gewählten Fotos')} className="einblick-preview" />}
          <label className={`btn btn-ghost btn-compact admin-upload-btn${locked ? ' is-disabled' : ''}`}>
            <Icon name="camera" />
            {file ? t('Anderes Foto wählen') : t('Foto wählen')}
            <input
              type="file"
              accept={EINBLICK_ACCEPT}
              onChange={handleFile}
              disabled={locked || saving}
              className="admin-upload-input"
              aria-describedby="einblick-photo-hint"
            />
          </label>
          <p className="field-hint" id="einblick-photo-hint">
            {t('JPG oder PNG. Bitte keine Personen, Nachnamen oder Adressen zeigen.')}
          </p>
        </div>

        <div className="einblick-form-fields">
          <div className="field">
            <label className="field-label" htmlFor="einblick-datum">
              {t('Datum')}
            </label>
            <input id="einblick-datum" type="date" value={datum} max={today} required onChange={(e) => setDatum(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="einblick-text">
              {t('Text (optional)')}
            </label>
            <textarea
              id="einblick-text"
              value={text}
              maxLength={MAX_EINBLICK_TEXT}
              rows={3}
              aria-describedby="einblick-text-count"
              onChange={(e) => setText(e.target.value)}
            />
            <p className="field-hint" id="einblick-text-count">
              {text.length} / {MAX_EINBLICK_TEXT}
            </p>
          </div>
          <label className="check einblick-consent">
            <input type="checkbox" checked={consent} required onChange={(e) => setConsent(e.target.checked)} />
            {t('Die Halterinnen und Halter der gezeigten Tiere sind einverstanden.')}
          </label>
        </div>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
          <Icon name="plus" />
          {saving ? t('Lädt hoch …') : t('Einblick hinzufügen')}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>
            {t('Abbrechen')}
          </button>
        )}
        {isDemo && <span className="field-hint">{readOnlyHint}</span>}
        {!isDemo && isFull && <span className="field-hint">{t(LIMIT_MESSAGE)}</span>}
      </div>
    </form>
  )
}
