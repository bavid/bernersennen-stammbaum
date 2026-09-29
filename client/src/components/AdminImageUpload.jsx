import { useState } from 'react'
import Icon from './Icon.jsx'
import { isPartnerMedia } from '../lib/discover.js'

// Direkter Bild-Upload im Admin (Partner-Logo, Bild einer Empfehlung) - genau eine Datei an einen
// eigenen Endpunkt, der Server prüft PNG/JPG/WebP (Magic Bytes) und die Größe. upload(file) liefert die
// neue öffentliche URL. Die Vorschau zeigt nur Bilder unter /partner-media (isPartnerMedia) - nie eine
// beliebige Adresse in einem src. disabled (z. B. in der Demo) sperrt die Dateiauswahl - den Grund dazu
// zeigt der Aufrufer an. previewAlt beschreibt die Vorschau (Vorgabe aus dem Label: "Aktuelles Logo",
// "Aktuelles Bild"). accept/hint (Phase P2): die Beiträge der Partner nehmen nur JPG oder PNG.
const DEFAULT_ACCEPT = 'image/png,image/jpeg,image/webp'
const DEFAULT_HINT = 'PNG, JPG oder WebP, höchstens 512 KB.'

export default function AdminImageUpload({
  label,
  buttonLabel,
  imageUrl,
  upload,
  onUploaded,
  previewClassName = 'admin-upload-preview',
  previewAlt = `Aktuelles ${label}`,
  disabled = false,
  accept = DEFAULT_ACCEPT,
  hint = DEFAULT_HINT
}) {
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
      {isPartnerMedia(imageUrl) && <img src={imageUrl} alt={previewAlt} className={previewClassName} />}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <label className={`btn btn-ghost admin-upload-btn${disabled ? ' is-disabled' : ''}`}>
        <Icon name="camera" />
        {busy ? 'Lädt …' : buttonLabel}
        {/* Visuell versteckt statt hidden (wie PhotoPicker.jsx .photo-add input): mit hidden verschwindet
            das Feld aus der Tab-Reihenfolge und ist per Tastatur nicht erreichbar. */}
        <input type="file" accept={accept} onChange={handleChange} disabled={busy || disabled} className="admin-upload-input" />
      </label>
      <p className="field-hint">{hint}</p>
    </div>
  )
}
