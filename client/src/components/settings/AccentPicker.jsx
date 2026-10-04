import { useId } from 'react'
import { AKZENT_VORSCHLAEGE, akzentFarben } from '../../lib/akzent.js'
import { resolveScheme } from '../../lib/darstellung.js'
import useSystemDark from '../../hooks/useSystemDark.js'

// Ohne eigene Farbe zeigt das Farbfeld das Terrakotta des Albums an.
const PICKER_DEFAULT = AKZENT_VORSCHLAEGE[0].farbe

// „Akzentfarbe“ im Mini-Designer: „Wie die Farbwelt“, sechs Vorschläge oder eine eigene Farbe (Farbfeld). Ist die Farbe im
// gerade gezeigten Modus zu hell bzw. zu dunkel für lesbare Schrift, rechnet lib/akzent.js sie nach - dann steht hier
// „Angepasst für gute Lesbarkeit“ (bei „Automatisch“ nach dem aktuellen Modus des Geräts). Der Hinweis ist kein
// Live-Bereich - beim Ziehen des Farbfelds käme sonst jede Zwischenfarbe als Ansage; Gruppe und Farbfeld verweisen auf ihn.
// value: '' oder #rrggbb; onChange(akzent, { live }) - live: das Farbfeld zieht gerade (gespeichert wird erst, wenn es
// ruht, hooks/useDarstellungSave.js).
export default function AccentPicker({ value, palette, modus, describedBy, onChange }) {
  const pickerId = useId()
  const noteId = useId()
  const systemDark = useSystemDark()
  const farben = akzentFarben(value, palette)
  const adjusted = Boolean(farben?.[resolveScheme(modus, systemDark)].angepasst)
  const isSuggestion = AKZENT_VORSCHLAEGE.some((option) => option.farbe === value)
  const isCustom = Boolean(value) && !isSuggestion

  return (
    <fieldset className="settings-choice designer-accent" aria-describedby={[describedBy, noteId].filter(Boolean).join(' ')}>
      <legend>Akzentfarbe</legend>
      <div className="designer-accent-options">
        <label className={`designer-accent-own${value === '' ? ' is-checked' : ''}`}>
          <input type="radio" name="akzent" value="" checked={value === ''} onChange={() => onChange('')} />
          <span className="designer-accent-dot is-palette" aria-hidden="true" />
          <span>Wie die Farbwelt</span>
        </label>
        {AKZENT_VORSCHLAEGE.map((option) => (
          <label key={option.farbe} className={`designer-accent-swatch${value === option.farbe ? ' is-checked' : ''}`} title={option.label}>
            <input type="radio" name="akzent" value={option.farbe} checked={value === option.farbe} onChange={() => onChange(option.farbe)} />
            <span className="designer-accent-dot" style={{ background: option.farbe }} aria-hidden="true" />
            <span className="visually-hidden">{option.label}</span>
          </label>
        ))}
        <label className={`designer-accent-custom${isCustom ? ' is-checked' : ''}`} htmlFor={pickerId}>
          <input
            id={pickerId}
            type="color"
            value={value || PICKER_DEFAULT}
            aria-describedby={noteId}
            onChange={(event) => onChange(event.target.value, { live: true })}
          />
          <span>Eigene Farbe</span>
          {isCustom && <span className="visually-hidden">, aktuell {value}</span>}
        </label>
      </div>
      <p id={noteId} className="field-hint designer-adjusted">
        {adjusted ? 'Angepasst für gute Lesbarkeit – Schrift und Knöpfe bleiben gut zu lesen.' : ''}
      </p>
    </fieldset>
  )
}
