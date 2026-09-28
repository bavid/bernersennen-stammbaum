import { useState } from 'react'
import Icon from './Icon.jsx'

// Direkter Bild-Upload im Admin (Partner-Logo, Bild einer Empfehlung) - genau eine Datei an einen
// eigenen Endpunkt, der Server prüft PNG/JPG/WebP (Magic Bytes) und die Größe. upload(file) liefert die
// neue öffentliche URL.
export default function AdminImageUpload({ label, buttonLabel, imageUrl, upload, onUploaded, previewClassName = 'admin-upload-preview' }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      onUploaded(await upload(file))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {imageUrl && <img src={imageUrl} alt="" className={previewClassName} />}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <label className="btn btn-ghost admin-upload-btn">
        <Icon name="camera" />
        {busy ? 'Lädt …' : buttonLabel}
        {/* Visuell versteckt statt hidden (wie PhotoPicker.jsx .photo-add input): mit hidden verschwindet
            das Feld aus der Tab-Reihenfolge und ist per Tastatur nicht erreichbar. */}
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleChange} disabled={busy} className="admin-upload-input" />
      </label>
      <p className="field-hint">PNG, JPG oder WebP, höchstens 512 KB.</p>
    </div>
  )
}
