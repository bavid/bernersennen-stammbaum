import { useState } from 'react'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import Icon from '../Icon.jsx'
import Avatar from '../Avatar.jsx'
import { dogLabel, speciesLabel } from '../../lib/timeline.js'
import { t } from '../../lib/i18n/index.js'

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

// Schritt 1 der Collage: Tiere wählen, Fotos pro Seite, optional eine Übersichtsseite. loaded: die Tiere sind geladen -
// ohne Tiere steht dann ein Hinweis statt einer leeren Auswahl mit "Alle"/"Keine" (Audit V7a).
export default function CollageSetup({ dogs, draft, onCreate, busy, loaded = true }) {
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
        <h2>{t('1. {animals} auswählen', { animals: words.animals })}</h2>
        {dogs.length > 0 && (
          <span className="segmented segmented-sm">
            <button type="button" onClick={() => setSelectedIds(dogs.map((d) => d.id))}>{t('Alle')}</button>
            <button type="button" onClick={() => setSelectedIds([])}>{t('Keine')}</button>
          </span>
        )}
      </div>
      {loaded && dogs.length === 0 ? (
        <p className="muted">
          {t('Noch keine {animals} – legt zuerst eure {animals} an, dann wird hier eine Collage daraus.', { animals: words.animals })}
        </p>
      ) : (
        <DogPicker dogs={dogs} selectedIds={selectedIds} onToggle={toggle} />
      )}

      <h2>{t('2. Aufteilung')}</h2>
      <div className="collage-options">
        <div className="field">
          <label className="field-label" htmlFor="collage-per-page">
            {t('Fotos pro Seite (höchstens)')}
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
          {t('Übersichtsseite mit allen Porträts voranstellen')}
        </label>
      </div>
      <p className="field-hint">{t('Vorlagen, Hintergründe und Sticker wählst du danach für jede Seite.')}</p>

      {draft?.pages?.length > 0 && (
        <p className="field-hint">
          {t('Hinweis: Neu erstellen ersetzt die {n} bisherigen Seiten deines Entwurfs.', { n: draft.pages.length })}
        </p>
      )}
      <button
        type="button"
        className="btn btn-primary btn-lg"
        disabled={!chosenIds.length || busy}
        onClick={() => onCreate({ selectedIds: chosenIds, perPage, overview })}
      >
        <Icon name="collage" />
        {busy
          ? t('Sammle Fotos …')
          : chosenIds.length === 1
            ? t('Collage erstellen ({n} {animal})', { n: 1, animal: words.animal })
            : t('Collage erstellen ({n} {animals})', { n: chosenIds.length, animals: words.animals })}
      </button>
    </div>
  )
}
