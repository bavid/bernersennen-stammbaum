import { Link } from 'react-router-dom'
import Avatar from './Avatar.jsx'
import { speciesSexLabel } from '../lib/timeline.js'
import { ageText } from '../lib/dates.js'
import { vermittlungStatusLabel } from '../lib/shelter.js'

// Karte für ein Tier in Vermittlung auf dem Portal seines Tierheims (/p/:slug, Sektion "Fellnasen/Tiere
// suchen ein Zuhause") - verlinkt auf den öffentlichen Steckbrief (/t/:slug). Teilt sich die Kartenoptik
// mit ShelterAnimalsPage (.shelter-card, shelter.css), nur ohne die dortigen Tierheim-eigenen Elemente
// (Steckbrief-Status, letzter Eintrag) - animal kommt roh von api.publicPartnerAnimals (camelCase).
export default function AnimalAdoptionCard({ animal }) {
  const age = animal.geburtsdatum ? ageText(animal.geburtsdatum) : null
  const statusLabel = vermittlungStatusLabel(animal.vermittlung_status)

  return (
    <Link to={`/t/${animal.slug}`} className="shelter-card">
      <span className="shelter-card-avatar">
        <Avatar dog={{ foto_url: animal.fotoUrl, name: animal.name }} size={64} />
      </span>
      <span className="shelter-card-body">
        <span className="shelter-card-name">{animal.name}</span>
        <span className="shelter-card-species">
          {speciesSexLabel(animal.tierart, animal.geschlecht)}
          {animal.rasse ? ` · ${animal.rasse}` : ''}
        </span>
        <span className="shelter-card-chips">
          {statusLabel && <span className={`chip status-chip status-chip-${animal.vermittlung_status}`}>{statusLabel}</span>}
          {age && <span className="chip">{age}</span>}
        </span>
      </span>
    </Link>
  )
}
