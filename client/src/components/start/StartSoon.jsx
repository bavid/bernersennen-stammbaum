import { Link } from 'react-router-dom'
import Icon from '../Icon.jsx'
import { formatTermin } from '../../lib/dates.js'
import { displayName } from '../../lib/timeline.js'

// Wie weit vorher ein Einzugs-Jahrestag auf Start erscheint.
export const ANNIVERSARY_WINDOW_DAYS = 30

// "In 5 Tagen: Nele ist 5 Jahre bei euch" / "Heute: Nele ist 5 Jahre bei euch!"
export function anniversaryText(anniversary) {
  const name = displayName(anniversary.dog)
  const years = `${anniversary.years} ${anniversary.years === 1 ? 'Jahr' : 'Jahre'}`
  if (anniversary.daysUntil === 0) return `Heute: ${name} ist ${years} bei euch!`
  const days = `${anniversary.daysUntil} ${anniversary.daysUntil === 1 ? 'Tag' : 'Tagen'}`
  return `In ${days}: ${name} ist ${years} bei euch`
}

// "Bald" auf Start (Phase W): der nächste Termin der Pinnwand und ein naher Einzugs-Jahrestag (lib/companions.js
// nextAnniversary), dazu der Weg zu den Notizen, sobald es welche gibt (Entscheidung D2: die Pinnwand des Zuhauses hat
// keinen eigenen Menüpunkt). Ohne all das steht hier nichts.
export default function StartSoon({ termin, anniversary, notesCount = 0 }) {
  const showAnniversary = anniversary && anniversary.daysUntil <= ANNIVERSARY_WINDOW_DAYS
  if (!termin && !showAnniversary && notesCount === 0) return null
  return (
    <section className="card start-card start-soon" aria-labelledby="start-soon-title">
      <h2 id="start-soon-title" className="start-card-title">
        Bald
      </h2>
      <ul className="start-soon-list" role="list">
        {termin && (
          <li>
            <Icon name="calendar" />
            <span>
              <strong>{formatTermin(termin.termin_datum, termin.termin_zeit, { short: true })}</strong> {termin.text}
            </span>
          </li>
        )}
        {showAnniversary && (
          <li>
            <Icon name="heart" />
            <span>{anniversaryText(anniversary)}</span>
          </li>
        )}
      </ul>
      {notesCount > 0 && (
        <Link to="/pinnwand" className="start-card-link">
          Notizen ({notesCount}) <Icon name="arrowRight" />
        </Link>
      )}
    </section>
  )
}
