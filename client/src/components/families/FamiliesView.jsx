import { useId } from 'react'
import DogCard from '../DogCard.jsx'
import FamilyFilter from './FamilyFilter.jsx'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import useGroupParam from '../../hooks/useGroupParam.js'
import { selectedGroup } from '../../lib/familyGroups.js'

// Familienbande im Standard-Auftritt (Familienbande 2): ein ruhiges Raster aller Tiere statt Abschnitten je Familie -
// ohne Beziehungs-Chips (Eltern, Geschwister und Nachwuchs stehen auf der Tierseite und im Stammbaum). Darüber, sobald
// Tiere aus mehr als einem Bereich kommen, ein Filter je Eigentümer; die Wahl steht in der Adresse (?gruppe=…), Zurück
// im Browser hebt sie wieder auf. Familien und befreundete Zuhause stehen seit Phase W unter "Familien". groups:
// lib/familyGroups.js buildFamilyGroups. Seit Phase W nur noch die Familienbande des Tierheims (OverviewPage) - die Tiere der
// Haushalte zeigt components/animals/AnimalGrid.
export default function FamiliesView({ groups }) {
  const { words } = useTheme()
  const [requested, select] = useGroupParam()
  const gridId = useId()
  const selected = selectedGroup(groups.owners, requested)
  const all = groups.owners.flatMap((group) => group.dogs)
  const shown = selected ? selected.dogs : all

  return (
    <section className="families-view" aria-labelledby="families-title">
      <div className="families-head">
        <h2 id="families-title" className="families-title">
          {words.animals}
        </h2>
        {groups.owners.length > 1 && (
          <FamilyFilter groups={groups.owners} total={all.length} selected={selected} onSelect={select} controls={gridId} />
        )}
      </div>
      {/* role="list": ohne Aufzählungszeichen vergisst Safari/VoiceOver sonst, dass es eine Liste ist */}
      <ul className="families-grid" id={gridId} role="list">
        {shown.map((dog) => (
          <li key={dog.id}>
            {/* Unter einem gewählten Zuhause stünde "aus Zuhause am Deich" an jeder Karte doppelt */}
            <DogCard dog={dog} variant="grid" showOrigin={!selected} />
          </li>
        ))}
      </ul>
    </section>
  )
}
