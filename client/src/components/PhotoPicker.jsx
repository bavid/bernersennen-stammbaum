import { useId, useState } from 'react'
import { api } from '../api'
import { downscaleImage } from '../lib/images.js'
import { useIsAdminView, useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import Icon from './Icon.jsx'

// Lädt Fotos sofort hoch (verkleinert) und verwaltet die Liste der URLs. Schreibgeschützt (Demo oder
// Admin-Ansicht, lib/demo.js): kein Upload, kein Entfernen.
export default function PhotoPicker({ value, onChange, multiple = true, label = 'Foto', onBusyChange, onError }) {
  const inputId = useId()
  const isDemo = useIsDemo()
  const isAdminView = useIsAdminView()
  const readOnlyHint = useReadOnlyHint('Im Demo-Modus deaktiviert')
  const [busy, setBusy] = useState(false)

  function setBusyState(next) {
    setBusy(next)
    onBusyChange?.(next)
  }

  async function handleFiles(event) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return

    setBusyState(true)
    onError?.(null)
    try {
      const uploaded = []
      for (const file of files) {
        const prepared = await downscaleImage(file)
        const { url } = await api.upload(prepared)
        uploaded.push(url)
      }
      onChange(multiple ? [...value, ...uploaded] : uploaded.slice(-1))
    } catch (err) {
      onError?.(err.message)
    } finally {
      setBusyState(false)
    }
  }

  const canAddMore = multiple || value.length === 0

  return (
    <div className="photo-picker">
      {value.map((url) => (
        <div className="photo-thumb" key={url}>
          <img src={url} alt="" />
          {!isDemo && (
            <button
              type="button"
              className="icon-btn"
              onClick={() => onChange(value.filter((u) => u !== url))}
              aria-label="Foto entfernen"
            >
              <Icon name="close" />
            </button>
          )}
        </div>
      ))}
      {canAddMore && !isDemo && (
        <label className={`photo-add ${busy ? 'is-busy' : ''}`} htmlFor={inputId}>
          <Icon name="camera" />
          <span>{busy ? 'Lädt …' : label}</span>
          <input id={inputId} type="file" accept="image/*" multiple={multiple} onChange={handleFiles} disabled={busy} />
        </label>
      )}
      {canAddMore && isDemo && (
        <span className="photo-add is-disabled muted" title={readOnlyHint}>
          <Icon name="camera" />
          <span>{isAdminView ? 'Admin-Ansicht: kein Upload' : 'Demo: kein Upload'}</span>
        </span>
      )}
    </div>
  )
}
