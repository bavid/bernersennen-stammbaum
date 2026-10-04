import { useState } from 'react'
import { useTheme } from '../themes/ThemeProvider.jsx'
import PhotoPicker from './PhotoPicker.jsx'
import ConfirmButton from './ConfirmButton.jsx'
import { todayIso } from '../lib/dates.js'
import { readSetting, writeSetting } from '../lib/storage.js'
import { KATEGORIE_VALUES, kategorieLabel } from '../lib/shelter.js'
import { taggedDogIds } from '../lib/erlebtMit.js'
import ErlebtMitPicker from './erlebtMit/ErlebtMitPicker.jsx'

// Neuer oder bearbeiteter Timeline-Eintrag. Das Datum bestimmt die Position in der Chronik.
// isHousehold: der aktive Bereich ist ein Haushalt ("Mein Zuhause") – nur dort kann ein Eintrag als
// privat markiert werden (sonst gibt es niemanden, vor dem er verborgen bleiben könnte).
// isShelter: der aktive Bereich ist ein Tierheim – statt "privat" gibt es hier eine Kategorie und die
// Checkbox "Im Steckbrief zeigen (öffentlich)" (isPublic), s. Phase T Task 4.
// canTag (Phase V2): im eigenen Zuhause lassen sich Tiere verbundener Zuhause markieren ("Erlebt mit", erlebtMit im
// Payload) - nie bei einem privaten Eintrag.
// submitLabel (Phase W): Beschriftung des Knopfs für einen neuen Beitrag, z. B. "Erzählen" im Composer auf Start.
export default function TimelineEntryForm({ entry, isHousehold, isShelter, canTag, submitLabel, onSubmit, onDelete, onCancel }) {
  const { words } = useTheme()
  const [autorName, setAutorName] = useState(() => entry?.autor_name || readSetting('autorName', ''))
  const [datum, setDatum] = useState(() => entry?.datum || todayIso())
  const [titel, setTitel] = useState(entry?.titel || '')
  const [text, setText] = useState(entry?.text || '')
  const [fotos, setFotos] = useState(entry?.foto_urls || [])
  const [privat, setPrivat] = useState(Boolean(entry?.privat))
  const [kategorie, setKategorie] = useState(entry?.kategorie || '')
  const [isPublic, setIsPublic] = useState(Boolean(entry?.is_public))
  const [erlebtMit, setErlebtMit] = useState(() => taggedDogIds(entry))
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      writeSetting('autorName', autorName.trim())
      const tags = canTag ? { erlebtMit: privat ? [] : erlebtMit } : {}
      await onSubmit({ autorName, datum, titel, text, fotoUrls: fotos, privat, kategorie: kategorie || null, isPublic, ...tags })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  async function handleDelete() {
    setError(null)
    setSaving(true)
    try {
      await onDelete()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form className="form-grid entry-form" onSubmit={handleSubmit}>
      {error && (
        <div className="error-banner span-2" role="alert">
          {error}
        </div>
      )}
      <div className="field span-2">
        <label className="field-label" htmlFor="entry-title">
          Was ist passiert?
        </label>
        <input
          id="entry-title"
          value={titel}
          onChange={(e) => setTitel(e.target.value)}
          placeholder="z. B. Erster Tag am See"
          maxLength={120}
          required
          autoFocus={!entry}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="entry-date">
          Datum
        </label>
        <input id="entry-date" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} required />
        <span className="field-hint">Wird automatisch nach dem Datum einsortiert.</span>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="entry-author">
          Dein Name
        </label>
        <input
          id="entry-author"
          value={autorName}
          onChange={(e) => setAutorName(e.target.value)}
          maxLength={60}
          autoComplete="name"
          required
        />
      </div>
      <div className="field span-2">
        <label className="field-label" htmlFor="entry-text">
          Erzähl mehr <span className="muted">(optional)</span>
        </label>
        <textarea id="entry-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={5000} />
      </div>
      <div className="field span-2">
        <span className="field-label">Fotos</span>
        <PhotoPicker value={fotos} onChange={setFotos} label="Fotos" onBusyChange={setUploading} onError={setError} />
      </div>
      {isHousehold && (
        <div className="field span-2">
          <label className="check">
            <input type="checkbox" checked={privat} onChange={(e) => setPrivat(e.target.checked)} />
            Nur für uns (privat)
          </label>
          <span className="field-hint">Private {words.entries} sehen nur die Menschen in eurem Zuhause.</span>
        </div>
      )}
      {canTag && (
        <div className="field span-2">
          <ErlebtMitPicker value={erlebtMit} onChange={setErlebtMit} disabled={privat} />
        </div>
      )}
      {isShelter && (
        <div className="field">
          <label className="field-label" htmlFor="entry-kategorie">
            Kategorie
          </label>
          <select id="entry-kategorie" value={kategorie} onChange={(e) => setKategorie(e.target.value)}>
            <option value="">– keine –</option>
            {KATEGORIE_VALUES.map((value) => (
              <option key={value} value={value}>
                {kategorieLabel(value)}
              </option>
            ))}
          </select>
        </div>
      )}
      {isShelter && (
        <div className="field span-2">
          <label className="check">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
            Im Steckbrief zeigen (öffentlich)
          </label>
          <span className="field-hint">Erscheint auf dem öffentlichen Steckbrief, sobald er veröffentlicht ist.</span>
        </div>
      )}
      <div className="form-actions span-2">
        {onDelete && <ConfirmButton onConfirm={handleDelete} label={`${words.entry} löschen`} disabled={saving} />}
        <span className="form-actions-spacer" />
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Abbrechen
          </button>
        )}
        <button className="btn btn-primary" type="submit" disabled={saving || uploading}>
          {saving ? 'Speichere …' : entry ? 'Speichern' : submitLabel || words.tellActionShort}
        </button>
      </div>
    </form>
  )
}
