import { useState } from 'react'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import Icon from '../Icon.jsx'
import Avatar from '../Avatar.jsx'
import { dogLabel, speciesLabel } from '../../lib/timeline.js'

const PER_PAGE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const DEFAULT_PER_PAGE = 6

function DogPicker({ dogs, selectedIds, onToggle }) {
  return (
    <div className="collage-dogs">
      {dogs.map((dog) => {
        const checked = selectedIds.includes(dog.id)
        return (
          <label key={dog.id} className={`collage-dog ${checked ? 'is-checked' : ''}`}>
            <input type="checkbox" checked={checked} onChange={() => onToggle(dog.id)} />
            <Avatar dog={dog} size={44} />
            <span>
              <strong>{dogLabel(dog)}</strong>
              {/* Audit V7a: ohne Rasse die Tierart ("Katze") statt mehrfach "Rasse unbekannt" */}
              <small>{dog.rasse || speciesLabel(dog.tierart || 'hund')}</small>
            </span>
            <span className="collage-dog-check" aria-hidden="true">
              <Icon name="check" />
            </span>
          </label>
        )
      })}
    </div>
  )
}

// Schritt 1 der Collage: Tiere wählen, Fotos pro Seite, optional eine Übersichtsseite.
export default function CollageSetup({ dogs, draft, onCreate, busy }) {
  const { words } = useTheme()
  const [selectedIds, setSelectedIds] = useState(draft?.selectedIds || [])
  const [perPage, setPerPage] = useState(draft?.perPage || DEFAULT_PER_PAGE)
  const [overview, setOverview] = useState(draft?.overview ?? false)
  const toggle = (id) => setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  // Ein Entwurf kann Tiere nennen, die es nicht mehr gibt - zählen und erstellen nur mit vorhandenen
  const chosenIds = selectedIds.filter((id) => dogs.some((dog) => dog.id === id))

  return (
    <div className="card form-stack collage-setup">
      <div className="collage-setup-head">
        <h2>1. {words.animals} auswählen</h2>
        <span className="segmented segmented-sm">
          <button type="button" onClick={() => setSelectedIds(dogs.map((d) => d.id))}>Alle</button>
          <button type="button" onClick={() => setSelectedIds([])}>Keine</button>
        </span>
      </div>
      <DogPicker dogs={dogs} selectedIds={selectedIds} onToggle={toggle} />

      <h2>2. Aufteilung</h2>
      <div className="collage-options">
        <div className="field">
          <label className="field-label" htmlFor="collage-per-page">
            Fotos pro Seite (höchstens)
          </label>
          <select id="collage-per-page" value={perPage} onChange={(e) => setPerPage(Number(e.target.value))}>
            {PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <label className="check">
          <input type="checkbox" checked={overview} onChange={(e) => setOverview(e.target.checked)} />
          Übersichtsseite mit allen Porträts voranstellen
        </label>
      </div>
      <p className="field-hint">Vorlagen, Hintergründe und Sticker wählst du danach für jede Seite.</p>

      {draft?.pages?.length > 0 && (
        <p className="field-hint">Hinweis: Neu erstellen ersetzt die {draft.pages.length} bisherigen Seiten deines Entwurfs.</p>
      )}
      <button
        type="button"
        className="btn btn-primary btn-lg"
        disabled={!chosenIds.length || busy}
        onClick={() => onCreate({ selectedIds: chosenIds, perPage, overview })}
      >
        <Icon name="collage" />
        {busy
          ? 'Sammle Fotos …'
          : `Collage erstellen (${chosenIds.length} ${chosenIds.length === 1 ? words.animal : words.animals})`}
      </button>
    </div>
  )
}
