import { relativeTime } from '../lib/dates.js'
import { describeVerlauf, verlaufDateTime } from '../lib/freigabeVerlauf.js'

// Verlauf eines Beitrags als kleine Zeitleiste (V-Fehler 3), älteste zuerst: was passiert ist, wann (relativ, der
// genaue Zeitpunkt steht im datetime) und bei einer Ablehnung der Grund. Beim Partner (PartnerPostRow) und im Admin
// (AdminApprovalVerlauf) gleich. Farbe je Zustand danach (partner-posts.css .freigabe-verlauf-item.is-*).
export default function FreigabeVerlauf({ verlauf, id }) {
  const entries = describeVerlauf(verlauf)
  if (entries.length === 0) return <p className="muted freigabe-verlauf-empty">Noch kein Verlauf.</p>

  return (
    <ol className="freigabe-verlauf" id={id}>
      {entries.map((entry) => (
        <li key={entry.id} className={`freigabe-verlauf-item is-${entry.tone}`}>
          <span className="freigabe-verlauf-label">{entry.label}</span>
          <time className="freigabe-verlauf-time" dateTime={verlaufDateTime(entry.createdAt)}>
            {typeof entry.createdAt === 'string' ? relativeTime(entry.createdAt) : ''}
          </time>
          {entry.grund && <span className="freigabe-verlauf-grund">{entry.grund}</span>}
        </li>
      ))}
    </ol>
  )
}
