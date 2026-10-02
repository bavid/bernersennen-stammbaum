import { useEffect, useState } from 'react'
import { api } from '../../api'

// "Erlebt mit" im Eintrags-Formular (Phase V2): Tiere verbundener Zuhause zum Ankreuzen (GET /api/erlebt-mit/tiere).
// value: ausgewählte Tier-Ids, onChange(neue Liste). disabled (z. B. bei einem privaten Eintrag) sperrt die Auswahl
// mit Hinweis. Ohne verbundene Zuhause bleibt nur ein kurzer Satz, wie man Verbindungen bekommt.
export default function ErlebtMitPicker({ value, onChange, disabled }) {
  const [animals, setAnimals] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let current = true
    api
      .erlebtMitTiere()
      .then((list) => current && setAnimals(list))
      .catch((err) => current && setError(err.message))
    return () => {
      current = false
    }
  }, [])

  function toggle(id) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  }

  return (
    <fieldset className="erlebt-mit-picker" disabled={disabled}>
      <legend className="field-label">
        Erlebt mit <span className="muted">(optional)</span>
      </legend>
      {error && <p className="field-error">{error}</p>}
      {animals && animals.length === 0 && (
        <p className="field-hint">
          Hier stehen die Tiere von Zuhausen, mit denen ihr verbunden seid – über einen Besuch oder eine gemeinsame Familie.
        </p>
      )}
      {animals && animals.length > 0 && (
        <ul className="erlebt-mit-options">
          {animals.map((animal) => (
            <li key={animal.id}>
              <label className={`erlebt-mit-option${value.includes(animal.id) ? ' is-selected' : ''}`}>
                <input type="checkbox" checked={value.includes(animal.id)} onChange={() => toggle(animal.id)} />
                <span className="erlebt-mit-option-name">{animal.nameUnbekannt ? 'Unbekannt' : animal.name}</span>
                <span className="erlebt-mit-option-home">{animal.zuhause}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="field-hint">
        {disabled
          ? 'Private Einträge können keine anderen Tiere markieren.'
          : 'Die Besitzer werden gefragt – erst danach erscheint der Eintrag auch in der Chronik ihres Tiers.'}
      </p>
    </fieldset>
  )
}
