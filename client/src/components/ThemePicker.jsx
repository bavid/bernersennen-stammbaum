import { useEffect, useState } from 'react'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { useIsDemo } from '../lib/demo.js'
import { THEME_IDS, getTheme } from '../themes/index.js'

const DEMO_HINT_ID = 'theme-picker-demo-hint'

// Aussehen wählen: Auswahl zeigt sofort eine Live-Vorschau (setPreviewId), gespeichert wird erst mit "Übernehmen".
// Ohne Speichern (Abbrechen, Modal schließen, Demo) endet die Vorschau beim Unmount wieder beim gespeicherten Aussehen.
// headingId: id einer außerhalb gerenderten "Aussehen"-Überschrift (z. B. FamilySettings), die dann per
// aria-labelledby als Name des Fieldsets dient statt einer zweiten, nur visuell versteckten <legend>.
// Ohne headingId (z. B. im eigenständigen Einsatz/Test) bekommt das Fieldset seine eigene versteckte legend.
export default function ThemePicker({ family, onSaved, headingId }) {
  const { setPreviewId } = useTheme()
  const isDemo = useIsDemo()
  const [selected, setSelected] = useState(family.theme)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => () => setPreviewId(null), [setPreviewId])

  function handleSelect(id) {
    setSelected(id)
    setError(null)
    setPreviewId(id === family.theme ? null : id)
  }

  async function handleSave() {
    setError(null)
    setSaving(true)
    try {
      const updated = await api.updateFamily({ theme: selected })
      onSaved(updated)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const unchanged = selected === family.theme

  return (
    <fieldset className="theme-picker" aria-labelledby={headingId}>
      {!headingId && <legend>Aussehen</legend>}
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <div className="theme-options">
        {THEME_IDS.map((id) => {
          const option = getTheme(id)
          const Mark = option.Mark
          const checked = selected === id
          return (
            <label key={id} className={`theme-option${checked ? ' is-checked' : ''}`}>
              <input
                type="radio"
                name="theme"
                value={id}
                checked={checked}
                onChange={() => handleSelect(id)}
              />
              <Mark size={44} />
              <span className="theme-option-label">{option.label}</span>
              <span className="theme-option-desc">{option.description}</span>
              {option.tricolor ? (
                <span className="tricolor" aria-hidden="true" />
              ) : (
                <span className="theme-option-rule" aria-hidden="true" />
              )}
              <span className="theme-option-caption">Gruppe heißt: {option.words.group}</span>
            </label>
          )
        })}
      </div>
      {isDemo && (
        <p id={DEMO_HINT_ID} className="field-hint">
          In der Demo nur als Vorschau – gespeichert wird nichts.
        </p>
      )}
      <div className="form-actions">
        <span className="form-actions-spacer" />
        <button
          type="button"
          className="btn btn-primary theme-picker-save"
          onClick={handleSave}
          disabled={saving || unchanged || isDemo}
          aria-describedby={isDemo ? DEMO_HINT_ID : undefined}
        >
          {saving ? 'Speichere …' : 'Übernehmen'}
        </button>
      </div>
    </fieldset>
  )
}
