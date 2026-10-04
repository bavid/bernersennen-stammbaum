import { useId } from 'react'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import FilterChips from '../FilterChips.jsx'
import AnimalTile from './AnimalTile.jsx'
import useGroupParam from '../../hooks/useGroupParam.js'
import { gridGroups, selectedGridGroup } from '../../lib/animalGrid.js'

// Raster „Alle“ der Tiere (Phase W, Schritt 4): auf /tiere alle Tiere aus Zuhause, Familien und befreundeten Zuhause (GET
// /api/tiere), auf der Gruppenseite die Tiere dieses einen Bereichs (lib/animalGrid.js areaGrid) - dieselbe Ansicht. Darüber,
// sobald die Tiere aus mehr als einem Bereich kommen, ein Filter je Bereich („Alle · Mein Zuhause · Familie Sonnenhang ·
// Zuhause Möwenweg“, mit Zahl); die Wahl steht in der Adresse (?gruppe=…), Zurück hebt sie wieder auf. grid: { tiere, areas }.
export default function AnimalGrid({ grid }) {
  const { words } = useTheme()
  const gridId = useId()
  const [requested, select] = useGroupParam()
  const groups = gridGroups(grid.areas)
  const selected = selectedGridGroup(groups, requested)
  const shown = selected ? grid.tiere.filter((animal) => animal.area.id === selected.areaId) : grid.tiere
  const options = [{ param: null, label: 'Alle', count: grid.tiere.length }, ...groups]

  return (
    <section className="animal-grid" aria-labelledby={`${gridId}-title`}>
      <h2 id={`${gridId}-title`} className="visually-hidden">
        {selected ? `${words.animals}: ${selected.label}` : `Alle ${words.animals}`}
      </h2>
      {groups.length > 0 && (
        <FilterChips
          options={options}
          current={selected?.param ?? null}
          onSelect={select}
          controls={gridId}
          label={`${words.animals} nach Zuhause und Familie filtern`}
        />
      )}
      {/* role="list": ohne Aufzählungszeichen vergisst Safari/VoiceOver sonst, dass es eine Liste ist */}
      <ul className="families-grid animal-grid-list" id={gridId} role="list">
        {shown.map((animal) => (
          <li key={animal.id}>
            {/* Unter einem gewählten Zuhause stünde „aus Zuhause Möwenweg“ an jeder Karte doppelt */}
            <AnimalTile animal={animal} showOrigin={!selected || animal.zuhause !== selected.title} />
          </li>
        ))}
      </ul>
    </section>
  )
}
