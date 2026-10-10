import DogCard from './DogCard.jsx'
import HouseGlyph from './HouseGlyph.jsx'
import Icon from './Icon.jsx'
import { displayName } from '../lib/timeline.js'
import { t } from '../lib/i18n/index.js'

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
      aria-label={open ? t('{n} Mitbewohner von {name} ausblenden', { n: count, name: displayName(dog) }) : t('{n} Mitbewohner von {name} zeigen', { n: count, name: displayName(dog) })}
      title={open ? t('Mitbewohner ausblenden') : t('Mitbewohner zeigen')}
    >
      <HouseGlyph size={18} />
      <span>{count}</span>
    </button>
  )
}

// Eine Generation. Eingeklappt ("kompakt") zeigt sie nur Porträt und Namen – die Linien bleiben verbunden.
export default function PedigreeRow({ index, row, born, compact, onToggleCompact, cardProps, setCardRef, housemates, setToggleRef }) {
  return (
    <section className={`pedigree-row ${compact ? 'is-compact' : ''}`} aria-label={t('Generation {n}', { n: index + 1 })}>
      <button
        type="button"
        className="pedigree-gen"
        onClick={onToggleCompact}
        aria-expanded={!compact}
        aria-label={`${t('Generation {n}', { n: index + 1 })}${born ? ` (${born})` : ''} – ${compact ? t('voll zeigen') : t('kompakt zeigen')}`}
        title={compact ? t('Generation aufklappen') : t('Generation kompakt zeigen')}
      >
        <span className="pedigree-gen-num">{ROMAN[index] || index + 1}</span>
        <span className="pedigree-gen-label">{t('Generation')}</span>
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
