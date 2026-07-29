import { useMemo, useState } from 'react'

export default function ParentPicker({ label, dogs, dogId, freitext, onChange }) {
  const [mode, setMode] = useState(freitext ? 'freitext' : 'liste')

  const options = useMemo(
    () => [...dogs].sort((a, b) => a.name.localeCompare(b.name)),
    [dogs]
  )

  function setMode_(next) {
    setMode(next)
    if (next === 'liste') {
      onChange({ dogId: dogId || '', freitext: '' })
    } else {
      onChange({ dogId: '', freitext: freitext || '' })
    }
  }

  return (
    <div className="form-row">
      <label>{label}</label>
      <div className="form-row-inline" style={{ marginBottom: 'var(--space-1)' }}>
        <label style={{ fontWeight: 400 }}>
          <input
            type="radio"
            checked={mode === 'liste'}
            onChange={() => setMode_('liste')}
          />{' '}
          Aus Liste wählen
        </label>
        <label style={{ fontWeight: 400 }}>
          <input
            type="radio"
            checked={mode === 'freitext'}
            onChange={() => setMode_('freitext')}
          />{' '}
          Hund nicht gelistet
        </label>
      </div>

      {mode === 'liste' ? (
        <select
          value={dogId || ''}
          onChange={(e) => onChange({ dogId: e.target.value ? Number(e.target.value) : '', freitext: '' })}
        >
          <option value="">– kein Elternteil ausgewählt –</option>
          {options.map((dog) => (
            <option key={dog.id} value={dog.id}>
              {dog.name}
              {dog.familyName ? ` (${dog.familyName})` : ''}
            </option>
          ))}
        </select>
      ) : (
        <input
          placeholder="Name, optional Zwinger/Züchter"
          value={freitext || ''}
          onChange={(e) => onChange({ dogId: '', freitext: e.target.value })}
        />
      )}
    </div>
  )
}
