import { useId } from 'react'
import Icon from '../Icon.jsx'
import { Button } from '../ui/index.js'
import { t } from '../../lib/i18n/index.js'

// Typ-Gruppen fürs öffentliche Entdecken - der Wert geht als typ an den Server (server/lib/partners.js TYP_VALUES, mit Komma).
export const ENTDECKEN_TYPEN = [
  { value: null, label: 'Alle' },
  { value: 'tierheim,vermittlung', label: 'Tierheime' },
  { value: 'hundeschule', label: 'Hundeschulen' },
  { value: 'hundesalon', label: 'Hundesalons' },
  { value: 'betreuung', label: 'Betreuung' },
  { value: 'futter,sonstige', label: 'Weitere' }
]

const MAX_Q_LENGTH = 60

// Suche nach Name, Art oder Ort (abschicken mit Enter oder „Suchen“) und darunter die Typ-Umschalter (aria-pressed),
// die sofort filtern. Reiner Formular-Baustein: die Seite hält q/typ und lädt.
export default function EntdeckenSuche({ q, typ, onQChange, onSubmit, onTypChange, controls }) {
  const inputId = useId()
  return (
    <div className="entdecken-suche">
      <form
        className="entdecken-suche-form"
        role="search"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
      >
        <label htmlFor={inputId} className="visually-hidden">
          {t('Suchen nach Name, Art oder Ort')}
        </label>
        <span className="entdecken-suche-field">
          <Icon name="search" />
          <input
            id={inputId}
            type="search"
            value={q}
            maxLength={MAX_Q_LENGTH}
            placeholder={t('Name, Art oder Ort – z. B. Hundeschule Köln')}
            onChange={(event) => onQChange(event.target.value)}
            enterKeyHint="search"
          />
        </span>
        <Button type="submit">{t('Suchen')}</Button>
      </form>
      <div className="family-filter entdecken-typen" role="group" aria-label={t('Art')}>
        {ENTDECKEN_TYPEN.map((option) => (
          <button
            key={option.value ?? 'alle'}
            type="button"
            className="family-filter-option"
            aria-pressed={option.value === typ}
            aria-controls={controls}
            onClick={() => onTypChange(option.value)}
          >
            {t(option.label)}
          </button>
        ))}
      </div>
    </div>
  )
}
