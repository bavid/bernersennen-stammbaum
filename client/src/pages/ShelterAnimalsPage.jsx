import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import Icon from '../components/Icon.jsx'
import Avatar from '../components/Avatar.jsx'
import Modal from '../components/Modal.jsx'
import QuickAnimalForm from '../components/QuickAnimalForm.jsx'
import ThemeMark from '../components/ThemeMark.jsx'
import WardNews from '../components/shelter/WardNews.jsx'
import { useToast } from '../components/Toast.jsx'
import useTabParam from '../hooks/useTabParam.js'
import { displayName, speciesLabel } from '../lib/timeline.js'
import { formatDayMonth } from '../lib/dates.js'
import { VERMITTLUNG_STATUS_VALUES, vermittlungStatusLabel, vermittlungStatusShortLabel } from '../lib/vermittlung.js'
import { t } from '../lib/i18n/index.js'
import { Button } from '../components/ui/index.js'

// "Alle" und "Ohne Status" (final-review Phase T Finding 1) dazu, sonst verschwanden Tiere ohne
// vermittlung_status (z. B. frisch aufgenommen, Status noch nicht gesetzt) aus jeder Ansicht. Je Status ein
// Chip (lib/vermittlung.js, seit Phase P inkl. "Pausiert"), Default bleibt in_vermittlung ("Verfügbar").
// Ehemalige - Tiere, die nach der Übergabe einem neuen Zuhause gehören und (mit dessen Einwilligung) hierher
// geteilt sind, siehe dog.shared_from (GET /api/dogs) - stehen unter "Vermittelt": ein eigener Chip
// "Ehemalige (mitgelesen)" ganz rechts zeigte sinngemäß dasselbe (V-Fehler 2).
const FILTERS = [
  { key: 'alle', label: 'Alle' },
  ...VERMITTLUNG_STATUS_VALUES.map((status) => ({ key: status, label: vermittlungStatusShortLabel(status) })),
  { key: 'ohne_status', label: 'Ohne Status' }
]

const DEFAULT_FILTER = 'in_vermittlung'
const ADOPTED_STATUS = 'vermittelt'
// Der Filter steht in der Adresse (?status=…, ohne Angabe „Verfügbar“) - „Alle ansehen“ bei den Schützlingen führt so zu
// „Vermittelt“, und Zurück aus einer Tierseite (Browser oder „Zurück“, state.from der Karten) landet im selben Filter.
const FILTER_PARAM = 'status'
const chipId = (key) => `shelter-filter-${key}`

function matchesFilter(dog, filter) {
  if (filter === 'alle') return true
  if (dog.shared_from) return filter === ADOPTED_STATUS
  if (filter === 'ohne_status') return !dog.vermittlung_status
  return dog.vermittlung_status === filter
}

// Eine Tierkarte: der Status ist das einzige Badge, ob der Steckbrief öffentlich ist, steht als ruhige Meta-Zeile
// darunter (Phase U). Ein mitgelesenes Tier (shared_from) ist vermittelt - statt des Steckbriefs nennt die
// Meta-Zeile sein neues Zuhause, und die Karte führt mit „Neuigkeiten“ in seine Chronik (was das Zuhause dort zeigt).
// state.from: „Zurück“ auf der Tierseite führt wieder in denselben Filter (?status=…).
function ShelterAnimalCard({ dog }) {
  const { pathname, search } = useLocation()
  const status = dog.shared_from ? ADOPTED_STATUS : dog.vermittlung_status
  const statusLabel = vermittlungStatusLabel(status)
  return (
    <Link
      to={dog.shared_from ? `/tier/${dog.id}?reiter=chronik` : `/tier/${dog.id}`}
      state={{ from: pathname + search }}
      className="shelter-card"
    >
      <span className="shelter-card-avatar">
        <Avatar dog={dog} size={64} />
      </span>
      <span className="shelter-card-body">
        <span className="shelter-card-name">{displayName(dog)}</span>
        <span className="shelter-card-species">{t(speciesLabel(dog.tierart))}</span>
        <span className="shelter-card-chips">
          {statusLabel ? (
            <span className={`chip status-chip status-chip-${status}`}>{t(statusLabel)}</span>
          ) : (
            <span className="chip muted">{t('Ohne Status')}</span>
          )}
        </span>
        {dog.shared_from ? (
          <span className="steckbrief-meta is-shared">
            <Icon name="eye" />
            {t('Ihr lest mit')} · {dog.shared_from}
          </span>
        ) : (
          <span className={`steckbrief-meta ${dog.public_slug ? 'is-public' : 'is-private'}`}>
            <Icon name={dog.public_slug ? 'globe' : 'lock'} />
            {dog.public_slug ? t('Steckbrief öffentlich') : t('Steckbrief privat')}
          </span>
        )}
        {dog.latest_entry_titel && (
          <span className="shelter-card-latest">
            {formatDayMonth(dog.latest_entry_datum)} · {dog.latest_entry_titel}
          </span>
        )}
        {dog.shared_from && (
          <span className="shelter-card-news">
            <Icon name="book" />
            {t('Neuigkeiten')}
          </span>
        )}
      </span>
    </Link>
  )
}

// "Unsere Tiere" - die Tiere des Tierheims (verfügbar/reserviert/pausiert/vermittelt); unter "Vermittelt" auch
// die Ehemaligen, die es (mit Einwilligung des neuen Zuhauses) weiter mitlesen darf. Darüber „So geht es euren
// Schützlingen“: deren neueste Erinnerungen (WardNews).
export default function ShelterAnimalsPage({ family }) {
  const [dogs, setDogs] = useState(null)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useTabParam(FILTER_PARAM, FILTERS, { fallback: DEFAULT_FILTER })
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
  // Audit W (N10): ein Chip „· 0“ sagt nichts - weg damit; „Alle“ und der gewählte Filter bleiben immer (sonst stünde die
  // Liste ohne ihren Filter da). Solange nichts geladen ist, alle.
  const shownFilters = FILTERS.filter((item) => !dogs || item.key === 'alle' || item.key === filter || counts[item.key] > 0)

  function closeForm() {
    setFormOpen(false)
  }

  // „Alle ansehen“: die vermittelten Tiere - der Fokus geht auf den gewählten Filter (die Liste steht gleich darunter).
  function showAdopted() {
    setFilter(ADOPTED_STATUS)
    document.getElementById(chipId(ADOPTED_STATUS))?.focus()
  }

  function announceCreated(dog) {
    closeForm()
    toast(t('{name} ist jetzt dabei', { name: displayName(dog) }))
    navigate(`/tier/${dog.id}`)
  }

  return (
    <div className="page">
      <header className="page-hero">
        <div>
          <span className="eyebrow">{family.name}</span>
          <h1>{t('Unsere Tiere')}</h1>
          <p className="page-lede">
            {t('Alle eure Tiere – verfügbar, reserviert, pausiert oder vermittelt. Bei vermittelten Tieren lest ihr weiter mit, wenn das neue Zuhause es erlaubt.')}
          </p>
        </div>
        <div className="page-hero-side">
          <div className="hero-actions">
            <Button type="button" size="lg" onClick={() => setFormOpen(true)}>
              <Icon name="plus" />
              {t('Tier aufnehmen')}
            </Button>
          </div>
        </div>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <WardNews onShowAll={showAdopted} />

      <div className="filter-chips" role="group" aria-label={t('Nach Status filtern')}>
        {shownFilters.map((item) => (
          <button
            key={item.key}
            id={chipId(item.key)}
            type="button"
            className={`filter-chip ${filter === item.key ? 'filter-chip-active' : ''}`}
            aria-pressed={filter === item.key}
            onClick={() => setFilter(item.key)}
          >
            {t(item.label)}
            {dogs && <span className="filter-chip-count"> · {counts[item.key]}</span>}
          </button>
        ))}
      </div>

      {dogs && filtered.length === 0 && (
        <div className="empty-state">
          <ThemeMark size={72} />
          <h3>{t('Keine Tiere in dieser Ansicht')}</h3>
          <p className="muted">{t('Wählt oben einen anderen Status, oder nehmt ein neues Tier auf.')}</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="shelter-grid">
          {filtered.map((dog) => (
            <ShelterAnimalCard key={dog.id} dog={dog} />
          ))}
        </div>
      )}

      <Modal open={formOpen} title={t('Tier aufnehmen')} onClose={closeForm}>
        <QuickAnimalForm allDogs={dogs || []} shelter onCreated={announceCreated} onCancel={closeForm} />
      </Modal>
    </div>
  )
}
