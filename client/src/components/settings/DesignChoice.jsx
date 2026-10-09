// Eine Gruppe Optionsfelder im Mini-Designer (Auswahl wirkt sofort) - als Kacheln (Farbwelten) oder als Segmente
// (Hintergrund, Schrift, Handschrift, Ecken, Größe). Echte Radios, nur unsichtbar: Tastatur mit Pfeilen.
import { useTr } from '../../lib/i18n/index.js'

export default function DesignChoice({ name, legend, options, value, onChange, variant, describedBy, renderExtra }) {
  const tr = useTr()
  return (
    <fieldset className={`settings-choice settings-choice-${variant}`} aria-describedby={describedBy}>
      <legend>{legend}</legend>
      <div className="settings-choice-options">
        {options.map((option) => (
          <label key={option.id} className={`settings-option${value === option.id ? ' is-checked' : ''}`}>
            <input type="radio" name={name} value={option.id} checked={value === option.id} onChange={() => onChange(option.id)} />
            {renderExtra?.(option)}
            <span className="settings-option-label">{tr(`design.${name}.${option.id}`, option.label)}</span>
            {option.hint && <span className="settings-option-hint">{tr(`design.${name}.${option.id}.hint`, option.hint)}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
