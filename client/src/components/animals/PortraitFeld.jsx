import { useId } from 'react'
import Icon from '../Icon.jsx'
import usePhotoUpload from '../../hooks/usePhotoUpload.js'
import { useIsDemo } from '../../lib/demo.js'

// Optionales Porträt beim Anlegen eines Tiers: ein runder Kreis zum Tippen, danach die runde Vorschau (wie im Profil).
// value: [url] oder []; schreibgeschützt (Demo, Admin-Ansicht) ohne Upload.
export default function PortraitFeld({ value, onChange, onBusyChange, onError }) {
  const inputId = useId()
  const isDemo = useIsDemo()
  const { busy, upload } = usePhotoUpload({ onUploaded: (urls) => onChange(urls.slice(-1)), onError, onBusyChange })
  const photo = value[0]

  function handleFiles(event) {
    const files = Array.from(event.target.files || []).slice(0, 1)
    event.target.value = ''
    upload(files)
  }

  return (
    <div className="portrait-feld">
      {isDemo ? (
        <span className="portrait-feld-kreis is-disabled" aria-hidden="true">
          <Icon name="camera" />
        </span>
      ) : (
        <label className={`portrait-feld-kreis${busy ? ' is-busy' : ''}`} htmlFor={inputId}>
          {photo ? <img src={photo} alt="" width="80" height="80" /> : <Icon name="camera" />}
          <span className="visually-hidden">{photo ? 'Anderes Foto wählen' : 'Foto wählen'}</span>
          <input id={inputId} className="visually-hidden" type="file" accept="image/*" onChange={handleFiles} disabled={busy} />
        </label>
      )}
      <span className="visually-hidden" aria-live="polite">
        {busy ? 'Foto wird hochgeladen' : ''}
      </span>
      <div className="portrait-feld-text">
        <span className="portrait-feld-label">
          Foto <span className="muted">(optional)</span>
        </span>
        {busy && <span className="field-hint">Lädt …</span>}
        {!busy && photo && !isDemo && (
          <button type="button" className="link-button" onClick={() => onChange([])}>
            Foto entfernen
          </button>
        )}
        {!busy && !photo && <span className="field-hint">{isDemo ? 'In der Demo ohne Foto' : 'Ein Bild fürs Profil'}</span>}
      </div>
    </div>
  )
}
