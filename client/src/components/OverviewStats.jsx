import { useMemo } from 'react'
import { layoutPedigree, collectNodes } from '../lib/pedigree.js'

// Kennzahlen im Kopf der Familienbande. familyCount (Phase V3, Auftritt mit Familien-Ansicht): Anzahl der Abschnitte
// auf der Seite ("Familien") - ohne familyCount (Berner) wie bisher die Generationen des Stammbaums.
export default function OverviewStats({ dogs, allDogs, links, familyCount }) {
  const showFamilies = Number.isInteger(familyCount)
  const generations = useMemo(
    () => (showFamilies ? 0 : layoutPedigree(collectNodes(dogs, allDogs), links).length),
    [showFamilies, dogs, allDogs, links]
  )
  const entries = dogs.reduce((sum, dog) => sum + (dog.timeline_count || 0), 0)
  const dogCount = dogs.filter((dog) => (dog.tierart || 'hund') === 'hund').length
  const others = dogs.length - dogCount
  const groups = showFamilies
    ? { value: familyCount, label: familyCount === 1 ? 'Familie' : 'Familien' }
    : { value: generations, label: generations === 1 ? 'Generation' : 'Generationen' }
  const items = [
    { value: dogCount, label: dogCount === 1 ? 'Hund' : 'Hunde' },
    ...(others ? [{ value: others, label: others === 1 ? 'weiteres Tier' : 'weitere Tiere' }] : []),
    groups,
    { value: entries, label: entries === 1 ? 'Erinnerung' : 'Erinnerungen' }
  ]
  return (
    <dl className="stats">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
