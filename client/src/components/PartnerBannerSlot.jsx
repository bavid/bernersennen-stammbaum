import { useState } from 'react'
import { api } from '../api'
import { useIsDemo } from '../lib/demo.js'
import { downscaleImage } from '../lib/images.js'
import { BANNER_ACCEPT, BANNER_TYPE_MESSAGE, MAX_BANNER_ALT_LENGTH, bannerFormData, isBannerFileType } from '../lib/partnerBanner.js'
import ConfirmButton from './ConfirmButton.jsx'
import Icon from './Icon.jsx'
import ReorderHandle from './ReorderHandle.jsx'

const THUMB_WIDTH = 480
const THUMB_HEIGHT = 160

// Feedback-Runde: statt "Alternativtext" mit Erklärsatz ein schlichtes, freiwilliges Feld - der Zweck steht nur für
// Screenreader dabei. Gesendet wird es weiter als alt.
export const ALT_LABEL = 'Kurze Beschreibung (optional)'
export const ALT_PLACEHOLDER = 'z. B. Welpen spielen im Garten'
const ALT_NOTE = 'Wird vorgelesen, wenn jemand das Foto nicht sehen kann.'

// Ein Bannerfoto im Profil (PartnerBannerEditor): Vorschau, kurze Beschreibung mit eigenem "Speichern", "Ersetzen"
// (neues Foto an derselben Stelle, die eingegebene Beschreibung kommt mit) und - abgesetzt am Ende - "Entfernen" (mit
// Rückfrage; das folgende rückt nach). Jede Aktion antwortet mit { banner, layout } (onChange). Alles ohne <form> - der
// Abschnitt steht neben dem Profil-Formular, Enter im Textfeld speichert die Beschreibung. label: z. B. "Foto 2 · rechts".
// reorder (Reiter „Fotos“): { hook, index, count } aus useDragReorder - dann steht auf dem Foto ein Griff zum Anordnen
// (ReorderHandle); null ohne. locked: der Editor sperrt alle Plätze, solange eine Reihenfolge gespeichert wird.
export default function PartnerBannerSlot({ item, label, onChange, locked: lockedByEditor = false, reorder = null }) {
  const isDemo = useIsDemo()
  const [alt, setAlt] = useState(item.alt)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const altId = `partner-banner-alt-${item.position}`
  const altDirty = alt.trim() !== item.alt
  const locked = isDemo || busy || lockedByEditor

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      onChange(await action())
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
    <li ref={reorder?.hook.itemRef(item.fotoUrl)} className={`partner-banner-slot${reorder ? ` ${reorder.hook.itemClass(item.fotoUrl)}` : ''}`} style={reorder?.hook.itemStyle(item.fotoUrl)}>
      <div className="partner-banner-thumb-wrap">
        <img src={item.fotoUrl} alt="" width={THUMB_WIDTH} height={THUMB_HEIGHT} className="partner-banner-thumb" />
        {reorder && (
          <ReorderHandle reorder={reorder.hook} itemKey={item.fotoUrl} index={reorder.index} count={reorder.count} label={label || `Foto ${item.position}`} className="partner-banner-handle" />
        )}
      </div>
      <div className="partner-banner-slot-body">
        {label && <span className="partner-banner-slot-label">{label}</span>}
        <div className="field">
          <label className="field-label" htmlFor={altId}>
            {ALT_LABEL}
          </label>
          <div className="partner-banner-alt-row">
            <input
              id={altId}
              aria-describedby={`${altId}-note`}
              value={alt}
              placeholder={ALT_PLACEHOLDER}
              maxLength={MAX_BANNER_ALT_LENGTH}
              disabled={isDemo}
              onChange={(e) => setAlt(e.target.value)}
              onKeyDown={handleAltKey}
            />
            <button
              type="button"
              className="btn btn-ghost btn-compact"
              disabled={locked || !altDirty}
              onClick={saveAlt}
              aria-label={`Beschreibung von Foto ${item.position} speichern`}
            >
              <Icon name="check" />
              Speichern
            </button>
          </div>
          <span className="visually-hidden" id={`${altId}-note`}>
            {ALT_NOTE}
          </span>
        </div>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="partner-banner-slot-actions">
          <label className={`btn btn-ghost btn-compact admin-upload-btn${locked ? ' is-disabled' : ''}`}>
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
            className="btn-compact btn-quiet btn-end"
            disabled={locked}
            onConfirm={() => run(() => api.partnerArea.deleteBanner(item.position))}
          />
        </div>
      </div>
    </li>
  )
}
