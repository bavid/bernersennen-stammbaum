import { useId } from 'react'
import { useSearchParams } from 'react-router-dom'
import DogCard from '../DogCard.jsx'
import AreaLinks from './AreaLinks.jsx'
import FamilyFilter from './FamilyFilter.jsx'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import { GROUP_PARAM, selectedGroup } from '../../lib/familyGroups.js'

// Familienbande im Standard-Auftritt (Familienbande 2): ein ruhiges Raster aller Tiere statt Abschnitten je Familie -
// ohne Beziehungs-Chips (Eltern, Geschwister und Nachwuchs stehen auf der Tierseite und im Stammbaum). Darüber, sobald
// Tiere aus mehr als einem Bereich kommen, ein Filter je Eigentümer; die Wahl steht in der Adresse (?gruppe=…), Zurück
// im Browser hebt sie wieder auf. Darunter (nur im eigenen Zuhause) die leise Zeile zu Familien und befreundeten
// Zuhause. groups: lib/familyGroups.js buildFamilyGroups; onOpenArea(id, name): hooks/useOpenArea.js (optional).
// hideTitle (Phase W): im Reiter "Alle" sagt der Reiter schon, was hier steht - die Überschrift bleibt nur für Screenreader.
export default function FamiliesView({ groups, onOpenArea, hideTitle = false }) {
  const { words } = useTheme()
  const [searchParams, setSearchParams] = useSearchParams()
  const gridId = useId()
  const requested = searchParams.get(GROUP_PARAM)
  const selected = selectedGroup(groups.owners, requested)
  const all = groups.owners.flatMap((group) => group.dogs)
  const shown = selected ? selected.dogs : all

  function select(param) {
    // Ein Klick auf die schon gewählte Gruppe legt keinen zweiten gleichen Eintrag in den Verlauf
    if (param === requested) return
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (param) next.set(GROUP_PARAM, param)
      else next.delete(GROUP_PARAM)
      return next
    })
  }

  return (
    <section className="families-view" aria-labelledby="families-title">
      <div className="families-head">
        <h2 id="families-title" className={hideTitle ? 'families-title visually-hidden' : 'families-title'}>
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
      {/* Phase W: auf Tiere und der Gruppenseite ohne die Zeile (Familien stehen unter "Familien") - nur mit onOpenArea. */}
      {onOpenArea && <AreaLinks memberships={groups.memberships} friends={groups.friends} onOpenArea={onOpenArea} />}
    </section>
  )
}
