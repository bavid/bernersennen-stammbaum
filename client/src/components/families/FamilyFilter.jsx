import { useTheme } from '../../themes/ThemeProvider.jsx'
import { shortAreaName } from '../../lib/familyGroups.js'

// Beschriftung im Filter: die Familie selbst heißt nur "Familie" (Wort des Auftritts), ein Zuhause kurz ("Lindenhof").
function optionLabel(group, words) {
  return group.kind === 'familie' ? words.group : shortAreaName(group.title)
}

// Filter über dem Raster der Familienbande (Familienbande 2): "Alle" und je Eigentümer ein Umschalter (aria-pressed) mit
// der Zahl seiner Tiere. Der volle Name steht im Tooltip (title, für Screenreader die Beschreibung) - der Name des
// Knopfs bleibt, was man sieht. groups: buildFamilyGroups().owners, selected: die gewählte Gruppe oder null (alle),
// onSelect(param | null), controls: id des Rasters.
export default function FamilyFilter({ groups, total, selected, onSelect, controls }) {
  const { words } = useTheme()
  const options = [
    { param: null, label: 'Alle', title: undefined, count: total },
    ...groups.map((group) => ({ param: group.param, label: optionLabel(group, words), title: group.title, count: group.dogs.length }))
  ]
  const current = selected?.param ?? null
  return (
    <div className="family-filter" role="group" aria-label={`${words.animals} filtern`}>
      {options.map((option) => (
        <button
          key={option.param ?? 'alle'}
          type="button"
          className="family-filter-option"
          aria-pressed={option.param === current}
          aria-controls={controls}
          title={option.title}
          onClick={() => onSelect(option.param)}
        >
          {/* Das Leerzeichen trennt Name und Zahl auch im Namen des Knopfs ("Lindenhof 1") */}
          {option.label}{' '}
          <span className="family-filter-count">{option.count}</span>
        </button>
      ))}
    </div>
  )
}
