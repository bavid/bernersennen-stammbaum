import DogCard from './DogCard.jsx'
import HouseGlyph from './HouseGlyph.jsx'
import Icon from './Icon.jsx'
import { displayName } from '../lib/timeline.js'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

// Knopf am Haupttier: klappt die Mitbewohner-Reihe darunter auf und zu
function HouseToggle({ dog, count, open, buttonRef, onClick }) {
  return (
    <button
      type="button"
      ref={buttonRef}
      className={`house-toggle ${open ? 'is-open' : ''}`}
      onClick={onClick}
      aria-expanded={open}
      aria-label={`${count} Mitbewohner von ${displayName(dog)} ${open ? 'ausblenden' : 'zeigen'}`}
      title={open ? 'Mitbewohner ausblenden' : 'Mitbewohner zeigen'}
    >
      <HouseGlyph size={18} />
      <span>{count}</span>
    </button>
  )
}

// Eine Generation. Eingeklappt ("kompakt") zeigt sie nur Porträt und Namen – die Linien bleiben verbunden.
export default function PedigreeRow({ index, row, born, compact, onToggleCompact, cardProps, setCardRef, housemates, setToggleRef }) {
  return (
    <section className={`pedigree-row ${compact ? 'is-compact' : ''}`} aria-label={`Generation ${index + 1}`}>
      <button
        type="button"
        className="pedigree-gen"
        onClick={onToggleCompact}
        aria-expanded={!compact}
        aria-label={`Generation ${index + 1}${born ? ` (${born})` : ''} – ${compact ? 'voll zeigen' : 'kompakt zeigen'}`}
        title={compact ? 'Generation aufklappen' : 'Generation kompakt zeigen'}
      >
        <span className="pedigree-gen-num">{ROMAN[index] || index + 1}</span>
        <span className="pedigree-gen-label">Generation</span>
        {born && <span className="pedigree-gen-date">{born}</span>}
        <Icon name="chevronDown" className={`pedigree-gen-chevron ${compact ? 'is-collapsed' : ''}`} />
      </button>
      <div className="pedigree-cards">
        {row.map((dog) => {
          const card = <DogCard key={dog.id} ref={setCardRef(dog.id)} dog={dog} variant={compact ? 'mini' : 'full'} {...cardProps(dog)} />
          const mates = !compact && housemates.get(dog.id)
          if (!mates) return card
          return (
            <span key={dog.id} className="card-slot">
              {card}
              <HouseToggle dog={dog} count={mates.count} open={mates.open} buttonRef={setToggleRef(dog.id)} onClick={mates.onToggle} />
            </span>
          )
        })}
      </div>
    </section>
  )
}
