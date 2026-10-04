import { useTheme } from '../../themes/ThemeProvider.jsx'
import FilterChips from '../FilterChips.jsx'
import { shortAreaName } from '../../lib/familyGroups.js'

// Beschriftung im Filter: die Familie selbst heißt nur "Familie" (Wort des Auftritts), ein Zuhause kurz ("Lindenhof").
function optionLabel(group, words) {
  return group.kind === 'familie' ? words.group : shortAreaName(group.title)
}

// Filter über dem Raster der Familienbande (Familienbande 2): "Alle" und je Eigentümer ein Umschalter (components/FilterChips)
// mit der Zahl seiner Tiere, der volle Name im Tooltip. groups: buildFamilyGroups().owners, selected: die gewählte Gruppe
// oder null (alle), onSelect(param | null), controls: id des Rasters.
export default function FamilyFilter({ groups, total, selected, onSelect, controls }) {
  const { words } = useTheme()
  const options = [
    { param: null, label: 'Alle', title: undefined, count: total },
    ...groups.map((group) => ({ param: group.param, label: optionLabel(group, words), title: group.title, count: group.dogs.length }))
  ]
  return (
    <FilterChips
      options={options}
      current={selected?.param ?? null}
      onSelect={onSelect}
      controls={controls}
      label={`${words.animals} filtern`}
    />
  )
}
