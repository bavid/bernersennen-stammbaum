import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../Icon.jsx'
import { Button, Chip, EmptyState } from '../ui/index.js'
import { formatDateShort } from '../../lib/dates.js'
import { displayName } from '../../lib/timeline.js'
import { ERINNERUNG_FILTER, ERINNERUNGEN_SEITE, filterMemories, memoryLabel } from '../../lib/sichtbarkeit.js'
import { useT } from '../../lib/i18n/index.js'

const FILTER_LABELS = { alle: 'Alle', privat: 'Privat', geteilt: 'Geteilt' }

function Filter({ filter, dogId, animals, onFilter, onDog }) {
  const t = useT()
  return (
    <div className="sicht-filter">
      <div className="sicht-filter-chips" role="group" aria-label={t('Erinnerungen filtern')}>
        {ERINNERUNG_FILTER.map((key) => (
          <button key={key} type="button" className="chip" aria-pressed={filter === key} onClick={() => onFilter(key)}>
            {t(FILTER_LABELS[key])}
          </button>
        ))}
      </div>
      <label className="sicht-filter-tier">
        <span className="visually-hidden">{t('Tier')}</span>
        <select value={dogId || ''} onChange={(event) => onDog(Number(event.target.value) || null)}>
          <option value="">{t('Alle Tiere')}</option>
          {animals.map((dog) => (
            <option key={dog.id} value={dog.id}>
              {displayName(dog)}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

function MemoryRow({ entry, dog, label, busy, readOnly, onToggle }) {
  const t = useT()
  return (
    <li className="settings-row sicht-erinnerung">
      <div className="settings-row-main">
        <Link to={`/tier/${entry.dog_id}#entry-${entry.id}`}>
          <strong>{entry.titel}</strong>
        </Link>
        <span className="settings-row-sub">
          {formatDateShort(entry.datum)} · {dog ? displayName(dog) : ''}
        </span>
        <Chip tone={entry.privat ? 'neutral' : 'ok'} icon={entry.privat ? 'lock' : 'users'}>
          {label}
        </Chip>
      </div>
      <div className="settings-row-actions">
        <Button variant="ghost" size="sm" disabled={readOnly} aria-busy={busy || undefined} onClick={() => !busy && onToggle(entry, !entry.privat)}>
          <Icon name={entry.privat ? 'users' : 'lock'} />
          {entry.privat ? t('Teilen') : t('Privat machen')}
        </Button>
      </div>
    </li>
  )
}

// Ansicht „Erinnerungen“: die neuesten eigenen Erinnerungen mit ihrer Sichtbarkeit und einem Knopf zum Umschalten
// (PUT /api/timeline/:id, nur „privat“ ändert sich). Filter: Alle/Privat/Geteilt und ein Tier; „Alle privaten anzeigen“
// zeigt jede private Erinnerung auf einmal (ohne „Mehr zeigen“).
export default function ErinnerungenAnsicht({ family, data, matrix, readOnly, sicht, dogId, onSelectDog }) {
  const t = useT()
  const [filter, setFilter] = useState('alle')
  const [limit, setLimit] = useState(ERINNERUNGEN_SEITE)
  const memberships = family.memberships || []
  const list = filterMemories(data.memories, { filter, dogId })
  const shown = list.slice(0, limit)
  const dogsById = new Map(data.animals.map((dog) => [dog.id, dog]))
  const privateCount = filterMemories(data.memories, { filter: 'privat', dogId }).length

  function showAllPrivate() {
    setFilter('privat')
    setLimit(Number.POSITIVE_INFINITY)
  }

  return (
    <section className="settings-group" aria-labelledby="sicht-erinnerungen-title">
      <h3 id="sicht-erinnerungen-title" className="visually-hidden">
        {t('Erinnerungen')}
      </h3>
      <Filter filter={filter} dogId={dogId} animals={data.animals} onFilter={setFilter} onDog={onSelectDog} />
      {privateCount > 0 && filter !== 'privat' && (
        <Button variant="ghost" size="sm" className="sicht-alle-privaten" onClick={showAllPrivate}>
          <Icon name="lock" />
          {t('Alle privaten anzeigen ({n})', { n: privateCount })}
        </Button>
      )}
      {shown.length === 0 ? (
        <EmptyState icon="book" title={t('Keine Erinnerungen in dieser Auswahl')} />
      ) : (
        <ul className="settings-list" aria-live="polite">
          {shown.map((entry) => (
            <MemoryRow
              key={entry.id}
              entry={entry}
              dog={dogsById.get(entry.dog_id)}
              label={memoryLabel(entry, matrix.sharesOf(entry.dog_id), memberships, data.guests.length)}
              busy={sicht.isBusy(`entry-${entry.id}`)}
              readOnly={readOnly}
              onToggle={sicht.setMemoryPrivat}
            />
          ))}
        </ul>
      )}
      {list.length > shown.length && (
        <Button variant="ghost" onClick={() => setLimit((current) => current + ERINNERUNGEN_SEITE)}>
          {t('Mehr zeigen')}
        </Button>
      )}
    </section>
  )
}
