import { Link } from 'react-router-dom'
import Icon from '../Icon.jsx'
import { formatTermin } from '../../lib/dates.js'
import { displayName } from '../../lib/timeline.js'
import AreaChip from '../feed/AreaChip.jsx'
import PinboardNotes from './PinboardNotes.jsx'
import { feedNoteLink } from '../../lib/startFeed.js'

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

// "Bald" auf Start (Phase W): die nächsten Termine der Pinnwände - des Zuhauses und der Familien (Phase W, Schritt 3: aus
// GET /api/start, schon ohne vergangene, lib/startFeed.js upcomingTermine; mit dem Namen der Familie als kleinem Hinweis),
// je eine Zeile mit Link zu ihrer Pinnwand - und ein naher Einzugs-Jahrestag
// (lib/companions.js nextAnniversary), darunter „Neu an der Pinnwand“ (PinboardNotes, Schritt 3) und der Weg zu den
// Notizen, sobald es welche gibt (Entscheidung D2: die Pinnwand des Zuhauses hat keinen eigenen Menüpunkt) - alles von den
// Pinnwänden an einer Stelle. Ohne all das steht hier nichts; nur neue Zettel: der Kasten heißt „Neu an der Pinnwand“.
export default function StartSoon({ termine = [], anniversary, notes = [], notesCount = 0 }) {
  const showAnniversary = anniversary && anniversary.daysUntil <= ANNIVERSARY_WINDOW_DAYS
  const hasSoon = termine.length > 0 || Boolean(showAnniversary)
  if (!hasSoon && notes.length === 0 && notesCount === 0) return null
  return (
    <section className="card start-card start-soon" aria-labelledby="start-soon-title">
      <h2 id="start-soon-title" className="start-card-title">
        {hasSoon || notes.length === 0 ? 'Bald' : 'Neu an der Pinnwand'}
      </h2>
      {hasSoon && (
        <ul className="start-soon-list" role="list">
          {termine.map((termin) => (
            <li key={termin.id}>
              <Icon name="calendar" />
              <Link to={feedNoteLink(termin)} className="start-soon-termin">
                <span className="start-soon-when">
                  <strong>{formatTermin(termin.termin_datum, termin.termin_zeit, { short: true })}</strong>
                  <AreaChip area={termin.area} />
                </span>
                <span className="start-soon-text">{termin.text}</span>
              </Link>
            </li>
          ))}
          {showAnniversary && (
            <li>
              <Icon name="heart" />
              <span>{anniversaryText(anniversary)}</span>
            </li>
          )}
        </ul>
      )}
      <PinboardNotes notes={notes} heading={hasSoon} />
      {notesCount > 0 && (
        <Link to="/pinnwand" className="start-card-link">
          Notizen ({notesCount}) <Icon name="arrowRight" />
        </Link>
      )}
    </section>
  )
}
