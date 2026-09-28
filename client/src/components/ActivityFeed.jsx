import { Link } from 'react-router-dom'
import Avatar from './Avatar.jsx'
import Icon from './Icon.jsx'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { dogLabel } from '../lib/timeline.js'
import { formatTermin, relativeTime } from '../lib/dates.js'

function toDog(entry) {
  return { name: entry.dog_name, name_unbekannt: entry.dog_name_unbekannt, rasse: entry.dog_rasse, foto_url: entry.dog_foto_url }
}

const MAX_TILES = 4

// "Was treiben die anderen?" – nächstes Treffen und die zuletzt geschriebenen Einträge.
export default function ActivityFeed({ entries: allEntries, termin }) {
  const { theme, words } = useTheme()
  const entries = allEntries.slice(0, termin ? MAX_TILES - 1 : MAX_TILES)
  if (!entries.length && !termin) {
    return (
      <section className="feed feed-empty" aria-label={words.newsTitle}>
        <Icon name="sprout" />
        <p>
          <strong>Noch keine Neuigkeiten.</strong> {theme.texts.feedEmpty} – die anderen sehen es dann hier.
        </p>
      </section>
    )
  }

  return (
    <section className="feed" aria-labelledby="feed-title">
      <h2 id="feed-title" className="feed-title">
        {words.newsTitle}
      </h2>
      <div className="feed-items">
        {termin && (
          <Link to="/pinnwand" className="feed-item feed-termin">
            <span className="feed-termin-icon">
              <Icon name="calendar" />
            </span>
            <span className="feed-body">
              <span className="feed-kicker">Nächstes Treffen</span>
              <span className="feed-headline">{formatTermin(termin.termin_datum, termin.termin_zeit, { short: true })}</span>
              <span className="feed-meta">{termin.text}</span>
            </span>
          </Link>
        )}
        {entries.map((entry) => (
          <Link key={entry.id} to={`/tier/${entry.dog_id}#entry-${entry.id}`} className="feed-item">
            <Avatar dog={toDog(entry)} size={44} />
            <span className="feed-body">
              <span className="feed-kicker">{dogLabel(toDog(entry))}</span>
              <span className="feed-headline">{entry.titel}</span>
              <span className="feed-meta">
                {entry.autor_name} · {relativeTime(entry.created_at)}
                {entry.comment_count > 0 &&
                  ` · ${entry.comment_count} ${entry.comment_count === 1 ? 'Kommentar' : 'Kommentare'}`}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
