import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../../api'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import Avatar from '../Avatar.jsx'
import Icon from '../Icon.jsx'
import Polaroid from '../Polaroid.jsx'
import { formatDateLong } from '../../lib/dates.js'
import { commentsLabel } from '../../lib/feed.js'
import { displayName } from '../../lib/timeline.js'

// Eine Karte: das erste Foto als Polaroid (ohne Foto das Porträt klein neben dem Namen), Tier, Tag, Titel, Anriss und die
// Grüße - sie führt zur Erinnerung auf der Tierseite (state.from: „Zurück“ kommt wieder hierher).
function WardCard({ item, index }) {
  const { words } = useTheme()
  const { pathname, search } = useLocation()
  const greetings = commentsLabel(item.comment_count, words)
  return (
    <li>
      <Link to={`/tier/${item.dog.id}#entry-${item.id}`} state={{ from: pathname + search }} className="ward-news-card">
        {item.foto_url && <Polaroid src={item.foto_url} index={index} width={200} height={150} className="ward-news-photo" />}
        <span className="ward-news-body">
          <span className="ward-news-who">
            {!item.foto_url && <Avatar dog={item.dog} size={40} />}
            <span className="ward-news-name">
              <span className="ward-news-dog">{displayName(item.dog)}</span>
              {item.datum && <span className="ward-news-date">{formatDateLong(item.datum)}</span>}
            </span>
          </span>
          <h3 className="ward-news-title">{item.titel}</h3>
          {item.text && <p className="ward-news-text">{item.text}</p>}
          {greetings && (
            <span className="ward-news-greetings">
              <Icon name="heart" />
              {greetings}
            </span>
          )}
        </span>
      </Link>
    </li>
  )
}

// „So geht es euren Schützlingen“ auf „Unsere Tiere“ eines Tierheims (GET /api/schuetzlinge, server/lib/schuetzlinge.js): die
// neuesten Erinnerungen der vermittelten Tiere, bei denen das neue Zuhause mitlesen lässt - höchstens fünf, die zuletzt
// geschriebene zuerst. Private Erinnerungen kommen gar nicht erst an (der Server lässt sie weg).
// onShowAll: „Alle ansehen“ - die vermittelten Tiere unten (Filter „Vermittelt“ der Seite).
export default function WardNews({ onShowAll }) {
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.resolve()
      .then(() => api.schuetzlinge())
      .then((data) => {
        if (!cancelled) setItems(Array.isArray(data?.items) ? data.items : [])
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="ward-news" aria-labelledby="ward-news-title" aria-busy={!items && !error ? true : undefined}>
      <div className="ward-news-head">
        <h2 id="ward-news-title" className="start-section-title">
          So geht es euren Schützlingen
        </h2>
        {items?.length > 0 && (
          <button type="button" className="btn btn-ghost ward-news-all" onClick={onShowAll}>
            Alle ansehen
          </button>
        )}
      </div>
      {error && (
        <p className="ward-news-error" role="alert">
          {error}
        </p>
      )}
      {items?.length === 0 && (
        <p className="ward-news-empty muted">
          Noch nichts Neues von euren Schützlingen. Sobald ein neues Zuhause euch mitlesen lässt und etwas festhält, seht ihr
          es hier.
        </p>
      )}
      {items?.length > 0 && (
        <ul className="ward-news-list" role="list">
          {items.map((item, index) => (
            <WardCard key={item.id} item={item} index={index} />
          ))}
        </ul>
      )}
    </section>
  )
}
