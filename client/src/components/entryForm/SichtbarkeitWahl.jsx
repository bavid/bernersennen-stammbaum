import { useId } from 'react'
import { visibilityOptions } from '../../lib/entryForm.js'

// Wer sieht die Erinnerung? Zwei klare Möglichkeiten statt einer Checkbox (nur im eigenen Zuhause, lib/entryForm.js):
// „Nur wir (privat)“ oder „Mit Familie Sonnenhang teilen“ - privat geht als Flag an den Server. Darunter, was die Wahl
// bedeutet.
export default function SichtbarkeitWahl({ privat, onChange, shareNames }) {
  const name = useId()
  const hintId = useId()
  const options = visibilityOptions(shareNames)
  const selected = options.find((option) => option.privat === privat) || options[1]
  return (
    <fieldset className="entry-visibility">
      <legend className="field-label">Wer sieht das?</legend>
      <div className="entry-visibility-options">
        {options.map((option) => (
          <label key={String(option.privat)} className={`entry-visibility-option${option.privat === privat ? ' is-selected' : ''}`}>
            <input
              type="radio"
              name={name}
              value={option.privat ? 'privat' : 'geteilt'}
              checked={option.privat === privat}
              onChange={() => onChange(option.privat)}
              aria-describedby={hintId}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      <p className="field-hint" id={hintId}>
        {selected.hint}
      </p>
    </fieldset>
  )
}
