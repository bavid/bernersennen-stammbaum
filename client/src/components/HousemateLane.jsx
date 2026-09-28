import DogCard from './DogCard.jsx'
import HouseGlyph from './HouseGlyph.jsx'
import Icon from './Icon.jsx'
import { useIsDemo } from '../lib/demo.js'
import { displayName } from '../lib/timeline.js'

// Aufgeklappte Mitbewohner-Reihe zwischen zwei Generationen ("Generation 4½"): jede Gruppe hängt unter
// ihrem Haupttier. Die Abstände setzt placeLaneGroups; bis sie gemessen sind, bleibt die Reihe unsichtbar.
// Der "+ Mitbewohner"-Knopf sitzt als letztes Kind IN der Gruppe (nicht an der Haupt-Reihe) – er macht
// die Gruppe minimal breiter, was placeLaneGroups beim nächsten Vermessen ohnehin automatisch einrechnet,
// und verschiebt keine Anker-Messung der Generation darüber.
export default function HousemateLane({ index, groups, placement, trackLeft, trackRef, setGroupRef, setCardRef, cardProps, onAddMitbewohner }) {
  const isDemo = useIsDemo()
  let cursor = trackLeft
  return (
    <section className="pedigree-lane" aria-label={`Mitbewohner in Generation ${index + 1}`}>
      <div className="pedigree-gen pedigree-gen-lane" aria-hidden="true">
        <HouseGlyph size={18} />
        <span className="pedigree-gen-label">Mitbewohner</span>
      </div>
      <div className="pedigree-lane-track" ref={trackRef}>
        {groups.map((group) => {
          const spot = placement?.get(group.anchorId)
          const style = spot && trackLeft !== undefined ? { marginLeft: spot.x - cursor } : { visibility: 'hidden' }
          if (spot) cursor = spot.x + spot.width
          return (
            <div key={group.anchorId} ref={setGroupRef(group.anchorId)} className="lane-group" style={style}>
              {group.members.map((dog) => (
                <DogCard key={dog.id} ref={setCardRef(dog.id)} dog={dog} variant="lane" {...cardProps(dog)} />
              ))}
              {!isDemo && onAddMitbewohner && group.anchor && (
                <button
                  type="button"
                  className="lane-add-btn"
                  onClick={() => onAddMitbewohner(group.anchor)}
                  aria-label={`Mitbewohner zu ${displayName(group.anchor)} hinzufügen`}
                  title="Mitbewohner hinzufügen"
                >
                  <Icon name="plus" />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
