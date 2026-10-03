import { Link } from 'react-router-dom'
import Avatar from '../Avatar.jsx'
import Icon from '../Icon.jsx'
import FamilyGroupHead from './FamilyGroupHead.jsx'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import { hasRole, roleLabel } from '../../lib/roles.js'
import { displayName } from '../../lib/timeline.js'

// Eine Familie, in der das eigene Zuhause Mitglied ist (nur in "Meine Chronik"): die eigenen Tiere, die ihr dort
// zeigt, und der Weg hinein ("Familie öffnen" - dort stehen auch die Tiere der anderen Mitglieder).
export default function MembershipCard({ group, onOpen }) {
  const { words } = useTheme()
  const headingId = `family-group-${group.key}`
  const role = roleLabel(words, group.rolle)
  // Teilen ("In Familien zeigen") darf man ab Mitglied - ein Gast bekommt den Hinweis nicht.
  const mayShare = hasRole({ role: group.rolle }, 'mitglied')
  return (
    <section className="family-group card is-familie is-membership" aria-labelledby={headingId}>
      <FamilyGroupHead id={headingId} kind="familie" title={group.title} meta={role ? `Eure Rolle: ${role}` : null}>
        {/* Der sichtbare Text bleibt Anfang des Namens (Sprachsteuerung: "Familie öffnen"), der Name der Familie
            steht für Screenreader dahinter. */}
        <button type="button" className="btn btn-ghost" onClick={() => onOpen(group.id, group.title)}>
          {words.group} öffnen<span className="visually-hidden">: {group.title}</span> <Icon name="arrowRight" />
        </button>
      </FamilyGroupHead>
      {group.dogs.length > 0 ? (
        <div className="family-group-shared">
          <p className="family-group-note">Hier zeigt ihr</p>
          <ul className="chip-list" aria-label={`Eure ${words.animals} in ${group.title}`}>
            {group.dogs.map((dog) => (
              <li key={dog.id}>
                <Link to={`/tier/${dog.id}`} className="chip">
                  <Avatar dog={dog} size={24} />
                  {displayName(dog)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="muted family-group-note">
          Noch keine eurer {words.animals} {words.inGroup}.{mayShare && ' Auf der Seite eines Tiers: „In Familien zeigen“.'}
        </p>
      )}
    </section>
  )
}
