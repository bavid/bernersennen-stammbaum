import { useMemo } from 'react'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { layoutPedigree, collectNodes } from '../lib/pedigree.js'

const entriesOf = (dogs) => dogs.reduce((sum, dog) => sum + (dog.timeline_count || 0), 0)
const entriesItem = (dogs, words) => {
  const entries = entriesOf(dogs)
  return { value: entries, label: entries === 1 ? words.entry : words.entries }
}

// Standard (Familienbande 2): alle Tiere, Zuhause bzw. Familien (falls es etwas zu zählen gibt), Erinnerungen.
function familyItems(dogs, familyStat, words) {
  return [
    { value: dogs.length, label: dogs.length === 1 ? words.animal : words.animals },
    ...(familyStat ? [familyStat] : []),
    entriesItem(dogs, words)
  ]
}

// Berner: Hunde, weitere Tiere (falls es welche gibt), Generationen des Stammbaums, Erinnerungen.
function treeItems(dogs, generations, words) {
  const dogCount = dogs.filter((dog) => (dog.tierart || 'hund') === 'hund').length
  const others = dogs.length - dogCount
  return [
    { value: dogCount, label: dogCount === 1 ? 'Hund' : 'Hunde' },
    ...(others ? [{ value: others, label: others === 1 ? 'weiteres Tier' : 'weitere Tiere' }] : []),
    { value: generations, label: generations === 1 ? 'Generation' : 'Generationen' },
    entriesItem(dogs, words)
  ]
}

// Kennzahlen im Kopf der Familienbande bzw. des Stammbaums. familyStat (Phase V3, Auftritt mit Familien-Ansicht;
// lib/familyGroups.js familyStat): { value, label } für "Familien" bzw. "Zuhause", null = keine solche Kennzahl.
// Familienbande 2: dort höchstens drei Zahlen - alle Tiere (Wort des Auftritts, auch Katzen und andere), Zuhause bzw.
// Familien, Erinnerungen; dogs sind dann die Tiere des Rasters (ohne unbekannte Eltern). Ohne die Angabe (undefined,
// Berner) wie bisher Hunde, weitere Tiere, die Generationen des Stammbaums und Erinnerungen.
export default function OverviewStats({ dogs, allDogs, links, familyStat }) {
  const { words } = useTheme()
  const showFamilies = familyStat !== undefined
  const generations = useMemo(
    () => (showFamilies ? 0 : layoutPedigree(collectNodes(dogs, allDogs), links).length),
    [showFamilies, dogs, allDogs, links]
  )
  const items = showFamilies ? familyItems(dogs, familyStat, words) : treeItems(dogs, generations, words)
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
