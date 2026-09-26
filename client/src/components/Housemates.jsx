import { useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from './Avatar.jsx'
import Icon from './Icon.jsx'
import { dogLabel, speciesLabel } from '../lib/timeline.js'

// "Lebt zusammen mit": Adoptiv-Geschwister und andere Tiere im selben Zuhause
export default function Housemates({ dog, allDogs, canEdit, onAdd, onRemove }) {
  const [adding, setAdding] = useState(false)
  const linkedIds = new Set(dog.housemates.map((h) => h.id))
  const candidates = allDogs.filter((other) => other.id !== dog.id && !linkedIds.has(other.id))

  if (!dog.housemates.length && !canEdit) return null

  return (
    <div className="facts-wide housemates">
      <dt>Lebt zusammen mit</dt>
      <dd className="chip-list">
        {dog.housemates.map((mate) => (
          <span key={mate.id} className="chip chip-housemate">
            <Link to={`/hund/${mate.id}`} className="chip-link">
              <Avatar dog={mate} size={24} />
              {dogLabel(mate)}
              {mate.tierart && mate.tierart !== 'hund' && <span className="muted"> · {speciesLabel(mate.tierart)}</span>}
            </Link>
            {canEdit && (
              <button
                type="button"
                className="chip-remove"
                onClick={() => onRemove(mate)}
                aria-label={`Verbindung zu ${dogLabel(mate)} entfernen`}
                title="Verbindung entfernen"
              >
                <Icon name="close" />
              </button>
            )}
          </span>
        ))}
        {canEdit && !adding && candidates.length > 0 && (
          <button type="button" className="chip chip-add" onClick={() => setAdding(true)}>
            <Icon name="plus" /> Mitbewohner
          </button>
        )}
        {canEdit && adding && (
          <select
            className="chip-select"
            autoFocus
            defaultValue=""
            aria-label="Tier auswählen, das hier mitwohnt"
            onChange={(e) => {
              if (e.target.value) onAdd(Number(e.target.value))
              setAdding(false)
            }}
            onBlur={() => setAdding(false)}
          >
            <option value="">– Tier auswählen –</option>
            {candidates.map((other) => (
              <option key={other.id} value={other.id}>
                {dogLabel(other)}
              </option>
            ))}
          </select>
        )}
      </dd>
    </div>
  )
}
