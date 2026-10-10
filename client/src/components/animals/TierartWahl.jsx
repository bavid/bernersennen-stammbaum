import { useId } from 'react'
import Icon from '../Icon.jsx'
import { TIERART_CHOICES } from '../../lib/newAnimal.js'
import { t } from '../../lib/i18n/index.js'

// „Was für ein Tier?“ - große Wahl-Chips (echte Radioknöpfe: Pfeiltasten wandern, Leertaste wählt). Keine Vorauswahl,
// jede Art ist gleich wahrscheinlich. error: Feldfehler (dann ist der erste Chip aria-invalid und bekommt den Fokus).
export default function TierartWahl({ value, onChange, error }) {
  const name = useId()
  const errorId = useId()
  return (
    <fieldset className="tierart-wahl">
      <legend className="field-label">{t('Was für ein Tier?')}</legend>
      <div className="tierart-chips">
        {TIERART_CHOICES.map((choice, index) => (
          <label key={choice.key} className={`tierart-chip${value === choice.key ? ' is-selected' : ''}`}>
            <input
              type="radio"
              name={name}
              value={choice.key}
              checked={value === choice.key}
              onChange={() => onChange(choice.key)}
              aria-invalid={error && index === 0 ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
            <span>{t(choice.label)}</span>
          </label>
        ))}
      </div>
      {error && (
        <p className="field-error" id={errorId}>
          <Icon name="alert" /> {error}
        </p>
      )}
    </fieldset>
  )
}
