import { Link } from 'react-router-dom'
import Avatar from '../Avatar.jsx'
import OriginChip from '../feed/OriginChip.jsx'
import { animalLink } from '../../lib/animalGrid.js'
import { isInMemory } from '../../lib/animalCircles.js'
import { displayName, speciesLabel } from '../../lib/timeline.js'
import { formatDateLong, yearOf } from '../../lib/dates.js'
import { t } from '../../lib/i18n/index.js'

// Eine Karte im Raster „Alle“ der Tiere (B+ Familienalbum): Foto im Kreis, Name, Rasse bzw. Art und Jahr, bei Tieren aus
// einem anderen Zuhause die Herkunft („aus Zuhause Möwenweg“, components/feed/OriginChip), darunter leise die letzte
// Erinnerung. Verstorbene Tiere sanft grau mit „In Erinnerung“. Die ganze Karte führt zur Tierseite - in den Bereich des
// Tiers (lib/animalGrid.js animalLink). showOrigin: false, wo schon nach genau diesem Zuhause gefiltert ist.
export default function AnimalTile({ animal, showOrigin = true }) {
  const remembered = isInMemory(animal)
  const year = yearOf(animal.geburtsdatum)
  const meta = [animal.rasse || speciesLabel(animal.tierart), year].filter(Boolean).join(' · ')
  return (
    <Link to={animalLink(animal)} className={`animal-tile${remembered ? ' is-memorial' : ''}`}>
      <Avatar dog={animal} size={60} className="animal-tile-photo" />
      <span className="animal-tile-body">
        <span className="animal-tile-name">{displayName(animal)}</span>
        {meta && <span className="animal-tile-meta">{meta}</span>}
        {remembered && <span className="animal-tile-note">{t('In Erinnerung')}</span>}
        {showOrigin && <OriginChip zuhause={animal.zuhause} area={animal.area} className="feed-area-chip animal-tile-origin" />}
        {animal.letzte_erinnerung && (
          <span className="animal-tile-last">{t('Zuletzt: {date}', { date: formatDateLong(animal.letzte_erinnerung) })}</span>
        )}
      </span>
    </Link>
  )
}
