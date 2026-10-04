import { Link, useLocation } from 'react-router-dom'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import Avatar from '../Avatar.jsx'
import { dogLabel } from '../../lib/timeline.js'
import { relativeTime } from '../../lib/dates.js'
import { commentsLabel, entryLink, excerpt, feedDog, thumbnails } from '../../lib/feed.js'

// Ein Beitrag im Feed von Start (Phase W): Tier mit Bild, wer wann geschrieben hat, Titel, ein Anriss des Texts, bis zu
// drei Vorschaubilder und die Zahl der Kommentare. Die ganze Karte führt zum Beitrag auf der Tierseite; der Titel ist
// eine h3 unter der Überschrift "Neuigkeiten".
// itemRef: optionaler Ref auf das Listenelement (z. B. um nach "Weitere Neuigkeiten" den Fokus zu setzen).
// state.from: die Tierseite führt mit "Zurück" wieder hierher (Phase W, Schritt 2).
export default function FeedItem({ entry, itemRef }) {
  const { words } = useTheme()
  const { pathname, search } = useLocation()
  const dog = feedDog(entry)
  const text = excerpt(entry.text)
  const photos = thumbnails(entry.foto_urls)
  const comments = commentsLabel(entry.comment_count, words)
  const meta = [entry.autor_name, relativeTime(entry.created_at)].filter(Boolean).join(' · ')
  return (
    <li className="feed-card" ref={itemRef}>
      <Link to={entryLink(entry)} state={{ from: pathname + search }} className="feed-card-link">
        <span className="feed-card-head">
          <Avatar dog={dog} size={40} />
          <span className="feed-card-who">
            <span className="feed-card-dog">{dogLabel(dog)}</span>
            {meta && <span className="feed-card-meta">{meta}</span>}
          </span>
        </span>
        <h3 className="feed-card-title">{entry.titel}</h3>
        {text && <p className="feed-card-text">{text}</p>}
        {photos.shown.length > 0 && (
          <span className={`feed-card-photos count-${photos.shown.length}`}>
            {photos.shown.map((url) => (
              <img key={url} src={url} alt="" loading="lazy" width="160" height="120" />
            ))}
            {photos.more > 0 && (
              <span className="feed-card-more" aria-label={`und ${photos.more} weitere Fotos`}>
                +{photos.more}
              </span>
            )}
          </span>
        )}
        {comments && <span className="feed-card-comments">{comments}</span>}
      </Link>
    </li>
  )
}
