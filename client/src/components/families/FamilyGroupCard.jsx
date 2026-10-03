import DogCard from '../DogCard.jsx'
import FamilyGroupHead from './FamilyGroupHead.jsx'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import { relationChips } from '../../lib/familyGroups.js'
import { displayName } from '../../lib/timeline.js'

function animalCount(count, words) {
  return `${count} ${count === 1 ? words.animal : words.animals}`
}

// Ein Tier mit seinen Beziehungs-Chips ("Mutter von …", "lebt mit …") - ohne Linien und Generationen.
function FamilyMember({ dog, nodes, links, hideOrigin }) {
  const chips = relationChips(dog, nodes, links)
  // Unter der Überschrift "Zuhause am Deich" stünde "aus Zuhause am Deich" an jeder Karte doppelt.
  const shown = hideOrigin && dog.shared_from ? { ...dog, shared_from: null } : dog
  return (
    <li className="family-member">
      <DogCard dog={shown} />
      {chips.length > 0 && (
        <ul className="relation-chips" aria-label={`Beziehungen von ${displayName(dog)}`}>
          {chips.map((chip) => (
            <li key={chip.kind} className={`relation-chip is-${chip.kind}`}>
              {chip.text}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

// Abschnitt mit den Tieren eines Bereichs (der eigene Bereich oder das Zuhause eines Mitglieds). nodes: alle bekannten
// Tiere für die Chips (collectNodes), links: "lebt zusammen"-Paare. hideOrigin: Abschnitt eines anderen Zuhauses.
export default function FamilyGroupCard({ group, nodes, links, hideOrigin = false }) {
  const { words } = useTheme()
  const headingId = `family-group-${group.key}`
  return (
    <section className={`family-group card is-${group.kind}`} aria-labelledby={headingId}>
      <FamilyGroupHead id={headingId} kind={group.kind} title={group.title} meta={animalCount(group.dogs.length, words)} />
      <ul className="family-members">
        {group.dogs.map((dog) => (
          <FamilyMember key={dog.id} dog={dog} nodes={nodes} links={links} hideOrigin={hideOrigin} />
        ))}
      </ul>
    </section>
  )
}
