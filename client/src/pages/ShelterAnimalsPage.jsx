import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import Icon from '../components/Icon.jsx'
import Avatar from '../components/Avatar.jsx'
import Modal from '../components/Modal.jsx'
import QuickAnimalForm from '../components/QuickAnimalForm.jsx'
import ThemeMark from '../components/ThemeMark.jsx'
import { useToast } from '../components/Toast.jsx'
import { displayName, speciesLabel } from '../lib/timeline.js'
import { formatDayMonth } from '../lib/dates.js'
import { vermittlungStatusLabel } from '../lib/shelter.js'

// Nur diese vier Ansichten - Ehemalige sind Tiere, die nicht mehr dem Tierheim gehören, aber
// (mit Einwilligung des neuen Zuhauses) hierher geteilt sind, siehe dog.shared_from (GET /api/dogs).
const FILTERS = [
  { key: 'in_vermittlung', label: 'In Vermittlung' },
  { key: 'reserviert', label: 'Reserviert' },
  { key: 'vermittelt', label: 'Vermittelt' },
  { key: 'ehemalige', label: 'Ehemalige (mitgelesen)' }
]

function matchesFilter(dog, filter) {
  if (filter === 'ehemalige') return Boolean(dog.shared_from)
  return !dog.shared_from && dog.vermittlung_status === filter
}

// Neuester sichtbarer Eintrag je Tier, aus den zuletzt geschriebenen Einträgen des Bereichs
// (api.recentActivity) - reicht für die Kartenvorschau, ohne pro Tier eine eigene Abfrage zu brauchen.
function latestEntriesByDog(recent) {
  const map = new Map()
  for (const entry of recent) {
    if (!map.has(entry.dog_id)) map.set(entry.dog_id, entry)
  }
  return map
}

function ShelterAnimalCard({ dog, latestEntry }) {
  const statusLabel = vermittlungStatusLabel(dog.vermittlung_status)
  return (
    <Link to={`/tier/${dog.id}`} className="shelter-card">
      <span className="shelter-card-avatar">
        <Avatar dog={dog} size={64} />
      </span>
      <span className="shelter-card-body">
        <span className="shelter-card-name">{displayName(dog)}</span>
        <span className="shelter-card-species">{speciesLabel(dog.tierart)}</span>
        <span className="shelter-card-chips">
          {dog.shared_from ? (
            <span className="chip">aus {dog.shared_from}</span>
          ) : statusLabel ? (
            <span className={`chip status-chip status-chip-${dog.vermittlung_status}`}>{statusLabel}</span>
          ) : (
            <span className="chip muted">Ohne Status</span>
          )}
          {!dog.shared_from && (
            <span className={`chip steckbrief-chip ${dog.public_slug ? 'is-public' : 'is-private'}`}>
              <Icon name={dog.public_slug ? 'globe' : 'lock'} />
              {dog.public_slug ? 'Steckbrief öffentlich' : 'Steckbrief privat'}
            </span>
          )}
        </span>
        {latestEntry && (
          <span className="shelter-card-latest">
            {formatDayMonth(latestEntry.datum)} · {latestEntry.titel}
          </span>
        )}
      </span>
    </Link>
  )
}

// "Unsere Tiere" - die Tiere des Tierheims in Vermittlung/reserviert/vermittelt, plus die Ehemaligen,
// die es (mit Einwilligung) weiter mitlesen darf.
export default function ShelterAnimalsPage({ family }) {
  const [dogs, setDogs] = useState(null)
  const [recent, setRecent] = useState([])
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState(FILTERS[0].key)
  const [formOpen, setFormOpen] = useState(false)
  const navigate = useNavigate()
  const toast = useToast()

  async function load() {
    const [dogsData, recentData] = await Promise.all([api.listDogs(), api.recentActivity(20)])
    setDogs(dogsData)
    setRecent(recentData)
  }

  useEffect(() => {
    load().catch((err) => setError(err.message))
  }, [])

  const latestByDog = useMemo(() => latestEntriesByDog(recent), [recent])
  const filtered = useMemo(() => (dogs || []).filter((dog) => matchesFilter(dog, filter)), [dogs, filter])
  const counts = useMemo(() => {
    const result = {}
    for (const item of FILTERS) result[item.key] = (dogs || []).filter((dog) => matchesFilter(dog, item.key)).length
    return result
  }, [dogs])

  function closeForm() {
    setFormOpen(false)
  }

  function announceCreated(dog) {
    closeForm()
    toast(`${displayName(dog)} ist jetzt dabei`)
    navigate(`/tier/${dog.id}`)
  }

  return (
    <div className="page">
      <header className="page-hero">
        <div>
          <span className="eyebrow">{family.name}</span>
          <h1>Unsere Tiere</h1>
          <p className="page-lede">
            Alle Tiere in Vermittlung, reserviert und vermittelt – dazu Ehemalige, die ihr weiter mitlesen dürft.
          </p>
        </div>
        <div className="page-hero-side">
          <div className="hero-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={() => setFormOpen(true)}>
              <Icon name="plus" />
              Tier aufnehmen
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <div className="filter-chips" role="group" aria-label="Nach Status filtern">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`filter-chip ${filter === item.key ? 'filter-chip-active' : ''}`}
            aria-pressed={filter === item.key}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
            {dogs && <span className="filter-chip-count"> · {counts[item.key]}</span>}
          </button>
        ))}
      </div>

      {dogs && filtered.length === 0 && (
        <div className="empty-state">
          <ThemeMark size={72} />
          <h3>Keine Tiere in dieser Ansicht</h3>
          <p className="muted">Wählt oben einen anderen Status, oder nehmt ein neues Tier auf.</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="shelter-grid">
          {filtered.map((dog) => (
            <ShelterAnimalCard key={dog.id} dog={dog} latestEntry={latestByDog.get(dog.id)} />
          ))}
        </div>
      )}

      <Modal open={formOpen} title="Tier aufnehmen" onClose={closeForm}>
        <QuickAnimalForm allDogs={dogs || []} shelter onCreated={announceCreated} onCancel={closeForm} />
      </Modal>
    </div>
  )
}
