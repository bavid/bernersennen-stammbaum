import { useId } from 'react'
import ErlebtMitPicker from '../erlebtMit/ErlebtMitPicker.jsx'
import { KATEGORIE_VALUES, kategorieLabel } from '../../lib/shelter.js'

// „Dein Name“ - steht im Formular oben, solange ihn das Gerät nicht kennt, sonst unter „Mehr“.
export function NameField({ value, onChange, error, errorId }) {
  const id = useId()
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        Dein Name
      </label>
      <input
        id={id}
        name="autorName"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={60}
        autoComplete="name"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  )
}

// Tierheim (Phase T Task 4): Kategorie und „Im Steckbrief zeigen (öffentlich)“ statt „privat“.
function ShelterFields({ kategorie, isPublic, onChange }) {
  const id = useId()
  return (
    <>
      <div className="field">
        <label className="field-label" htmlFor={id}>
          Kategorie
        </label>
        <select id={id} name="kategorie" value={kategorie} onChange={(event) => onChange({ kategorie: event.target.value })}>
          <option value="">– keine –</option>
          {KATEGORIE_VALUES.map((value) => (
            <option key={value} value={value}>
              {kategorieLabel(value)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="check">
          <input type="checkbox" name="isPublic" checked={isPublic} onChange={(event) => onChange({ isPublic: event.target.checked })} />
          Im Steckbrief zeigen (öffentlich)
        </label>
        <span className="field-hint">Erscheint auf dem öffentlichen Steckbrief, sobald er veröffentlicht ist.</span>
      </div>
    </>
  )
}

// Inhalt von „Mehr“ in „Erinnerung festhalten“: der Name (wenn bekannt), „Mit dabei“ (canTag, Phase V2) und die Felder
// des Tierheims. form/onChange: die Werte des Formulars (TimelineEntryForm).
export default function EntryExtras({ form, onChange, name, canTag, isShelter }) {
  return (
    <div className="entry-extras">
      {name}
      {canTag && <ErlebtMitPicker value={form.erlebtMit} onChange={(erlebtMit) => onChange({ erlebtMit })} disabled={form.privat} />}
      {isShelter && <ShelterFields kategorie={form.kategorie} isPublic={form.isPublic} onChange={onChange} />}
    </div>
  )
}
