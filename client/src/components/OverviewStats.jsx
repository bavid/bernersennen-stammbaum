import { useMemo } from 'react'
import { layoutPedigree, collectNodes } from '../lib/pedigree.js'

// Kennzahlen im Kopf der Familienbande. familyStat (Phase V3, Auftritt mit Familien-Ansicht; lib/familyGroups.js
// familyStat): { value, label } für "Familien" bzw. "Zuhause", null = keine solche Kennzahl - ohne die Angabe
// (undefined, Berner) wie bisher die Generationen des Stammbaums.
export default function OverviewStats({ dogs, allDogs, links, familyStat }) {
  const showFamilies = familyStat !== undefined
  const generations = useMemo(
    () => (showFamilies ? 0 : layoutPedigree(collectNodes(dogs, allDogs), links).length),
    [showFamilies, dogs, allDogs, links]
  )
  const entries = dogs.reduce((sum, dog) => sum + (dog.timeline_count || 0), 0)
  const dogCount = dogs.filter((dog) => (dog.tierart || 'hund') === 'hund').length
  const others = dogs.length - dogCount
  const groups = showFamilies ? familyStat : { value: generations, label: generations === 1 ? 'Generation' : 'Generationen' }
  const items = [
    { value: dogCount, label: dogCount === 1 ? 'Hund' : 'Hunde' },
    ...(others ? [{ value: others, label: others === 1 ? 'weiteres Tier' : 'weitere Tiere' }] : []),
    ...(groups ? [groups] : []),
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
