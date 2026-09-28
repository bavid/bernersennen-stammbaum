import Avatar from './Avatar.jsx'
import { formatDateLong } from '../lib/dates.js'

// Karte für ein vermitteltes Tier mit Happy-End-Geschichte auf dem Portal seines früheren Tierheims
// (/p/:slug, Sektion "Happy Ends") - api.publicHappyEnds liefert je Tier { name, tierart, fotoUrl,
// entry: { titel, datum, text, fotoUrl } }, NIE etwas zur neuen Familie (siehe routes/publicAnimals.js).
// Rein zur Ansicht, kein Link - anders als AnimalAdoptionCard gibt es keine Steckbrief-Seite mehr dafür.
export default function HappyEndCard({ happyEnd }) {
  const { name, entry } = happyEnd
  const photo = entry.fotoUrl || happyEnd.fotoUrl

  return (
    <article className="shelter-card happy-end-card">
      <span className="shelter-card-avatar">
        <Avatar dog={{ foto_url: photo, name }} size={64} />
      </span>
      <span className="shelter-card-body">
        <span className="shelter-card-name">{name}</span>
        <span className="shelter-card-species">{formatDateLong(entry.datum)}</span>
        <p className="happy-end-title">{entry.titel}</p>
        {entry.text && <p className="happy-end-text">{entry.text}</p>}
      </span>
    </article>
  )
}
