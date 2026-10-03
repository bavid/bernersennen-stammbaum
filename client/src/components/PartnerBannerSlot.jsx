import { useState } from 'react'
import { api } from '../api'
import { useIsDemo } from '../lib/demo.js'
import { downscaleImage } from '../lib/images.js'
import { BANNER_ACCEPT, BANNER_TYPE_MESSAGE, MAX_BANNER_ALT_LENGTH, bannerFormData, isBannerFileType } from '../lib/partnerBanner.js'
import AdminField, { fieldProps } from './AdminField.jsx'
import ConfirmButton from './ConfirmButton.jsx'
import Icon from './Icon.jsx'

const THUMB_WIDTH = 480
const THUMB_HEIGHT = 160

// Ein Bannerfoto im Profil (PartnerBannerEditor): Vorschau, Alternativtext mit eigenem Speichern, Ersetzen (neues Foto
// an derselben Stelle, der eingegebene Text kommt mit) und Entfernen (das folgende rückt nach). Jede Aktion antwortet
// mit der ganzen Liste (onChange). Alles ohne <form> - der Abschnitt steht neben dem Profil-Formular, Enter im Textfeld
// speichert den Text.
export default function PartnerBannerSlot({ item, onChange }) {
  const isDemo = useIsDemo()
  const [alt, setAlt] = useState(item.alt)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const altId = `partner-banner-alt-${item.position}`
  const altDirty = alt.trim() !== item.alt
  const locked = isDemo || busy

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      const result = await action()
      onChange(result.banner)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function saveAlt() {
    if (!altDirty || locked) return
    run(() => api.partnerArea.updateBannerAlt(item.position, alt.trim()))
  }

  function handleAltKey(event) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    saveAlt()
  }

  async function handleReplace(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!isBannerFileType(file)) {
      setError(BANNER_TYPE_MESSAGE)
      return
    }
    run(async () => api.partnerArea.replaceBanner(item.position, bannerFormData(await downscaleImage(file), alt)))
  }

  return (
    <li className="partner-banner-slot">
      <img src={item.fotoUrl} alt="" width={THUMB_WIDTH} height={THUMB_HEIGHT} className="partner-banner-thumb" />
      <div className="partner-banner-slot-body">
        <span className="partner-banner-slot-label">{item.position === 1 ? 'Foto 1 · groß' : 'Foto 2'}</span>
        <AdminField id={altId} label="Alternativtext (freiwillig)" hint="Was ist zu sehen? Für Menschen, die das Bild nicht sehen.">
          <input
            {...fieldProps(altId, { hint: true })}
            value={alt}
            maxLength={MAX_BANNER_ALT_LENGTH}
            disabled={isDemo}
            onChange={(e) => setAlt(e.target.value)}
            onKeyDown={handleAltKey}
          />
        </AdminField>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="partner-banner-slot-actions">
          <button type="button" className="btn btn-ghost" disabled={locked || !altDirty} onClick={saveAlt}>
            <Icon name="check" />
            Text speichern
          </button>
          <label className={`btn btn-ghost admin-upload-btn${locked ? ' is-disabled' : ''}`}>
            <Icon name="camera" />
            {busy ? 'Lädt …' : 'Ersetzen'}
            <input
              type="file"
              accept={BANNER_ACCEPT}
              onChange={handleReplace}
              disabled={locked}
              className="admin-upload-input"
              aria-label={`Foto ${item.position} ersetzen`}
            />
          </label>
          <ConfirmButton
            label="Entfernen"
            confirmLabel="Wirklich entfernen?"
            ariaLabel={`Foto ${item.position} entfernen`}
            disabled={locked}
            onConfirm={() => run(() => api.partnerArea.deleteBanner(item.position))}
          />
        </div>
      </div>
    </li>
  )
}
