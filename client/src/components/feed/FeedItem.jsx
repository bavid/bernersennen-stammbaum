import { Link, useLocation } from 'react-router-dom'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import Avatar from '../Avatar.jsx'
import Icon from '../Icon.jsx'
import Polaroid from '../Polaroid.jsx'
import { dogLabel } from '../../lib/timeline.js'
import { formatDateLong } from '../../lib/dates.js'
import { commentsLabel, entryLink, excerpt, feedDog, thumbnails } from '../../lib/feed.js'

// Eine Erinnerung im Feed von Start (Phase W, Look B+ Familienalbum): Tier mit Bild, wer erzählt hat und von wann die
// Erinnerung ist (der Tag passt zum Kapitel darüber), Titel, ein Anriss des Texts, das erste Foto als Polaroid daneben
// („+2“ für weitere) und - mit Herz - die Zahl der Grüße (Namen gibt es dafür nicht: Grüße sind Kommentare, keine
// Reaktionen). Die ganze Karte führt zur Erinnerung auf der Tierseite; der Titel ist eine h3 unter „Neue Erinnerungen“ -
// darum ist das Foto in der Karte Schmuck (alt leer), der Titel sagt schon, worum es geht.
// itemRef: optionaler Ref auf das Listenelement (z. B. um nach „Weitere Erinnerungen“ den Fokus zu setzen).
// state.from: die Tierseite führt mit "Zurück" wieder hierher (Phase W, Schritt 2).
export default function FeedItem({ entry, itemRef }) {
  const { words } = useTheme()
  const { pathname, search } = useLocation()
  const dog = feedDog(entry)
  const text = excerpt(entry.text)
  const photos = thumbnails(entry.foto_urls)
  const photo = photos.shown[0]
  const comments = commentsLabel(entry.comment_count, words)
  const meta = [entry.autor_name && `erzählt von ${entry.autor_name}`, formatDateLong(entry.datum)].filter(Boolean).join(' · ')
  return (
    <li className="feed-card" ref={itemRef}>
      <Link to={entryLink(entry)} state={{ from: pathname + search }} className={`feed-card-link${photo ? ' has-photo' : ''}`}>
        <span className="feed-card-head">
          <Avatar dog={dog} size={40} />
          <span className="feed-card-who">
            <span className="feed-card-dog">{dogLabel(dog)}</span>
            {meta && <span className="feed-card-meta">{meta}</span>}
          </span>
        </span>
        <div className="feed-card-body">
          <h3 className="feed-card-title">{entry.titel}</h3>
          {text && <p className="feed-card-text">{text}</p>}
          {comments && (
            <span className="feed-card-comments">
              <Icon name="heart" />
              {comments}
            </span>
          )}
        </div>
        {photo && (
          <div className="feed-card-photo">
            <Polaroid src={photo} index={entry.id} width={120} height={90} />
            {photos.more > 0 && (
              <span className="feed-card-more" aria-label={`und ${photos.more} weitere Fotos`}>
                +{photos.more}
              </span>
            )}
          </div>
        )}
      </Link>
    </li>
  )
}
