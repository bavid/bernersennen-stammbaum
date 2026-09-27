import DogCard from './DogCard.jsx'
import HouseGlyph from './HouseGlyph.jsx'

// Aufgeklappte Mitbewohner-Reihe zwischen zwei Generationen ("Generation 4½"): jede Gruppe hängt unter
// ihrem Haupttier. Die Abstände setzt placeLaneGroups; bis sie gemessen sind, bleibt die Reihe unsichtbar.
export default function HousemateLane({ index, groups, placement, trackLeft, trackRef, setGroupRef, setCardRef, cardProps }) {
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
            </div>
          )
        })}
      </div>
    </section>
  )
}
