import { useId, useMemo, useState } from 'react'
import { dogLabel, shortName } from '../lib/timeline.js'

// Elternteil wählen: aus der Liste (auch rudelübergreifend) oder als Freitext.
export default function ParentPicker({ label, sex, dogs, value, onChange, excludeId, ownFamilyId }) {
  const id = useId()
  const [mode, setMode] = useState(value.freitext ? 'freitext' : 'liste')

  const options = useMemo(
    () =>
      dogs
        .filter((dog) => dog.geschlecht === sex && dog.id !== excludeId)
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [dogs, sex, excludeId]
  )

  function switchMode(next) {
    setMode(next)
    onChange({ dogId: '', freitext: '' })
  }

  return (
    <div className="field">
      <div className="field-row">
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        <div className="segmented segmented-sm" role="group" aria-label={`${label} angeben`}>
          <button type="button" aria-pressed={mode === 'liste'} onClick={() => switchMode('liste')}>
            Aus Liste
          </button>
          <button type="button" aria-pressed={mode === 'freitext'} onClick={() => switchMode('freitext')}>
            Nicht erfasst
          </button>
        </div>
      </div>

      {mode === 'liste' ? (
        <select
          id={id}
          value={value.dogId || ''}
          onChange={(e) => onChange({ dogId: e.target.value ? Number(e.target.value) : '', freitext: '' })}
        >
          <option value="">– unbekannt –</option>
          {options.map((dog) => (
            <option key={dog.id} value={dog.id}>
              {dogLabel(dog)}
              {!dog.name_unbekannt && dog.name !== shortName(dog.name) ? ` (${dog.name})` : ''}
              {!dog.name_unbekannt && dog.rasse ? ` · ${dog.rasse}` : ''}
              {ownFamilyId && dog.family_id !== ownFamilyId ? ` · ${dog.familyName}` : ''}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          placeholder="Name, gern mit Zwinger – z. B. Balu vom Schwarzwaldhof"
          value={value.freitext || ''}
          maxLength={120}
          onChange={(e) => onChange({ dogId: '', freitext: e.target.value })}
        />
      )}
    </div>
  )
}
