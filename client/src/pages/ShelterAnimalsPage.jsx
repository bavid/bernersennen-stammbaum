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
import { VERMITTLUNG_STATUS_VALUES, vermittlungStatusLabel, vermittlungStatusShortLabel } from '../lib/vermittlung.js'

// "Alle" und "Ohne Status" (final-review Phase T Finding 1) dazu, sonst verschwanden Tiere ohne
// vermittlung_status (z. B. frisch aufgenommen, Status noch nicht gesetzt) aus jeder Ansicht - sie
// passten weder in eine der Status-Kacheln noch in "Ehemalige" (kein shared_from). Ehemalige sind
// Tiere, die nicht mehr dem Tierheim gehören, aber (mit Einwilligung des neuen Zuhauses) hierher
// geteilt sind, siehe dog.shared_from (GET /api/dogs). Je Status ein Chip (lib/vermittlung.js, seit
// Phase P inkl. "Pausiert"), Default bleibt in_vermittlung ("Verfügbar", siehe unten).
const FILTERS = [
  { key: 'alle', label: 'Alle' },
  ...VERMITTLUNG_STATUS_VALUES.map((status) => ({ key: status, label: vermittlungStatusShortLabel(status) })),
  { key: 'ohne_status', label: 'Ohne Status' },
  { key: 'ehemalige', label: 'Ehemalige (mitgelesen)' }
]

const DEFAULT_FILTER = 'in_vermittlung'

function matchesFilter(dog, filter) {
  if (filter === 'alle') return true
  if (filter === 'ehemalige') return Boolean(dog.shared_from)
  if (filter === 'ohne_status') return !dog.shared_from && !dog.vermittlung_status
  return !dog.shared_from && dog.vermittlung_status === filter
}

// Eine Tierkarte: der Status ist das einzige Badge, ob der Steckbrief öffentlich ist, steht als ruhige Meta-Zeile
// darunter (Phase U).
function ShelterAnimalCard({ dog }) {
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
        </span>
        {!dog.shared_from && (
          <span className={`steckbrief-meta ${dog.public_slug ? 'is-public' : 'is-private'}`}>
            <Icon name={dog.public_slug ? 'globe' : 'lock'} />
            {dog.public_slug ? 'Steckbrief öffentlich' : 'Steckbrief privat'}
          </span>
        )}
        {dog.latest_entry_titel && (
          <span className="shelter-card-latest">
            {formatDayMonth(dog.latest_entry_datum)} · {dog.latest_entry_titel}
          </span>
        )}
      </span>
    </Link>
  )
}

// "Unsere Tiere" - die Tiere des Tierheims (verfügbar/reserviert/pausiert/vermittelt), plus die
// Ehemaligen, die es (mit Einwilligung) weiter mitlesen darf.
export default function ShelterAnimalsPage({ family }) {
  const [dogs, setDogs] = useState(null)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState(DEFAULT_FILTER)
  const [formOpen, setFormOpen] = useState(false)
  const navigate = useNavigate()
  const toast = useToast()

  // Der neueste sichtbare Eintrag je Tier kommt seit final-review Phase T Finding 9 direkt mit GET
  // /api/dogs (latest_entry_titel/latest_entry_datum) - keine zweite Anfrage gegen recentActivity mehr
  // nötig, und keine Lücke mehr für Tiere, deren letzter Eintrag außerhalb der letzten 20 des Bereichs lag.
  async function load() {
    setDogs(await api.listDogs())
  }

  useEffect(() => {
    load().catch((err) => setError(err.message))
  }, [])

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
            Alle eure Tiere – verfügbar, reserviert, pausiert oder vermittelt – dazu Ehemalige, die ihr weiter mitlesen dürft.
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
            <ShelterAnimalCard key={dog.id} dog={dog} />
          ))}
        </div>
      )}

      <Modal open={formOpen} title="Tier aufnehmen" onClose={closeForm}>
        <QuickAnimalForm allDogs={dogs || []} shelter onCreated={announceCreated} onCancel={closeForm} />
      </Modal>
    </div>
  )
}
