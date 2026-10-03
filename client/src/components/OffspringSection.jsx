import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import Avatar from './Avatar.jsx'
import Icon from './Icon.jsx'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { formatDateLong } from '../lib/dates.js'
import { isEditable } from '../lib/areas.js'
import { addMatingPath, buildLitters } from '../lib/litters.js'
import { displayName, shortName } from '../lib/timeline.js'

// So viele Geschwistergruppen zeigt der Abschnitt; alles Weitere steht auf der eigenen Seite (/wuerfe).
const MAX_LITTERS = 3

function LitterSummary({ litter, words }) {
  const parents = [litter.mother?.name, litter.father?.name].filter(Boolean).join(' × ')
  const title = litter.birthDate ? `${words.litter} vom ${formatDateLong(litter.birthDate)}` : words.litter
  return (
    <li className="offspring-item">
      <p className="offspring-item-title">
        <strong>{title}</strong>
        {parents && <span className="muted"> · von {parents}</span>}
      </p>
      <ul className="chip-list" aria-label={`Geschwister: ${title}`}>
        {litter.puppies.map((dog) => (
          <li key={dog.id}>
            <Link to={`/tier/${dog.id}`} className="chip">
              <Avatar dog={dog} size={24} />
              {displayName(dog)}
            </Link>
          </li>
        ))}
      </ul>
    </li>
  )
}

// Eine Verpaarung trägt man mit einer eigenen Hündin ein (BreedingRecords, wie der Server) - ohne sie führt der
// Hinweis unten ins Leere.
function hasOwnFemaleDog(dogs) {
  return (dogs || []).some((dog) => dog.geschlecht === 'huendin' && (dog.tierart || 'hund') === 'hund' && isEditable(dog))
}

// Abschnitt "Nachwuchs" unter dem Stammbaum der Familienbande (Phase U, Familienbande 2: "Stammbaum & Nachwuchs") -
// für Auftritte, die ihn nicht als eigenen Reiter führen (theme.littersInNav false, OverviewPage). Erscheint nur, wenn
// es Geschwister (gleiche Eltern, gleicher Geburtstag), erwarteten Nachwuchs oder eingetragene Verpaarungen gibt.
// dogs: die Tiere der Seite (listDogs). Wer eine Verpaarung eintragen darf (canWrite, eigene Hündin), findet den Weg
// dazu im Kopf des Abschnitts - ohne all das bleibt dafür nur eine leise Zeile (/wuerfe hat im Standard-Auftritt keinen
// Reiter). events: die Verpaarungen des Bereichs (hooks/useBreedingEvents.js, lädt OverviewPage - die braucht sie auch
// für "Stammbaum & Nachwuchs"); null, solange sie laden.
export default function OffspringSection({ dogs, events, canWrite = false }) {
  const { words } = useTheme()
  const { litters, planned } = useMemo(() => buildLitters(dogs || [], events || []), [dogs, events])

  if (!events) return null
  const mayAddMating = canWrite && hasOwnFemaleDog(dogs)
  const withSiblings = litters.filter((litter) => litter.puppies.length > 1)
  if (withSiblings.length === 0 && planned.length === 0 && events.length === 0) {
    if (!mayAddMating) return null
    return (
      <p className="muted offspring-hint">
        {words.littersLabel} geplant?{' '}
        <Link to={addMatingPath()}>
          {words.addMating} <Icon name="arrowRight" />
        </Link>
      </p>
    )
  }
  const hidden = withSiblings.length - MAX_LITTERS

  return (
    <section className="offspring-section card" aria-labelledby="offspring-title">
      <div className="section-head">
        <h2 id="offspring-title">{words.littersLabel}</h2>
        <div className="offspring-actions">
          {mayAddMating && (
            <Link to={addMatingPath()} className="offspring-add">
              <Icon name="plus" /> {words.addMating}
            </Link>
          )}
          <Link to="/wuerfe" className="btn btn-ghost">
            {words.littersLabel} ansehen <Icon name="arrowRight" />
          </Link>
        </div>
      </div>
      {planned.length > 0 && (
        <ul className="offspring-planned">
          {planned.map(({ event, expectedBirth }) => (
            <li key={event.id}>
              <Icon name="sprout" />
              Erwartet um den {formatDateLong(expectedBirth)}: {shortName(event.mutter_name)} ×{' '}
              {shortName(event.vater_name || event.vater_freitext || 'unbekannt')}
            </li>
          ))}
        </ul>
      )}
      {withSiblings.length > 0 ? (
        <ul className="offspring-list">
          {withSiblings.slice(0, MAX_LITTERS).map((litter) => (
            <LitterSummary key={litter.key} litter={litter} words={words} />
          ))}
        </ul>
      ) : (
        planned.length === 0 && (
          <p className="muted">
            {events.length === 1 ? `1 ${words.mating} eingetragen.` : `${events.length} ${words.matings} eingetragen.`}
          </p>
        )
      )}
      {hidden > 0 && <p className="muted">… und {hidden} weitere.</p>}
    </section>
  )
}
