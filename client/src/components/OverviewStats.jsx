import { useTheme } from '../themes/ThemeProvider.jsx'

const entriesOf = (dogs) => dogs.reduce((sum, dog) => sum + (dog.timeline_count || 0), 0)
const entriesItem = (dogs, words) => {
  const entries = entriesOf(dogs)
  return { value: entries, label: entries === 1 ? words.entry : words.entries }
}

// Kennzahlen im Kopf der Familienbande (Familienbande 2): höchstens drei Zahlen - alle Tiere (auch Katzen und andere),
// Zuhause bzw. Familien (familyStat aus lib/familyGroups.js: { value, label }, null = keine solche Kennzahl) und
// Erinnerungen. dogs sind die Tiere des Rasters (ohne unbekannte Eltern).
export default function OverviewStats({ dogs, familyStat }) {
  const { words } = useTheme()
  const items = [
    { value: dogs.length, label: dogs.length === 1 ? words.animal : words.animals },
    ...(familyStat ? [familyStat] : []),
    entriesItem(dogs, words)
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
