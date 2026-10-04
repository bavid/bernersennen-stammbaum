import { Link, useLocation } from 'react-router-dom'
import Icon from '../Icon.jsx'
import AreaChip from '../feed/AreaChip.jsx'
import { relativeTime } from '../../lib/dates.js'
import { feedKey, feedNoteLink } from '../../lib/startFeed.js'

// „1 Antwort“ / „3 Antworten“ - ohne Antworten nichts.
export function repliesLabel(count) {
  if (!Number.isInteger(count) || count <= 0) return null
  return count === 1 ? '1 Antwort' : `${count} Antworten`
}

// „Neu an der Pinnwand“ auf Start (Phase W, Schritt 3) - im Kasten „Bald“ (components/start/StartSoon.jsx: alles von der
// Pinnwand an einer Stelle): die neuesten Zettel aus dem Zuhause und den Familien (GET /api/start, lib/startFeed.js
// pinboardNews - ohne die Termine, die darüber schon stehen) als kurze Zeilen statt großer Karten: Zettel sind immer von
// heute, die Erinnerungen darunter stehen nach ihrem Tag im Album - so drängen sich Zettel nicht davor. Je Zeile der Anfang
// des Texts, ein kleiner Bereichs-Hinweis (Familie), die Zahl der Antworten und wann zuletzt etwas dazukam (wer ihn
// angeheftet hat, steht an der Pinnwand) - und der Weg zur Pinnwand dort. heading: eigene Zwischenüberschrift (h3), wenn
// darüber Termine stehen; sonst trägt der Kasten selbst den Namen.
export default function PinboardNotes({ notes, heading = true }) {
  const { pathname, search } = useLocation()
  if (!notes?.length) return null
  return (
    <div className="start-pinboard">
      {heading && <h3 className="start-pinboard-title">Neu an der Pinnwand</h3>}
      <ul className="start-pinboard-list" role="list">
        {notes.map((note) => {
          const meta = [repliesLabel(note.comment_count), relativeTime(note.activity_at || '')].filter(Boolean).join(' · ')
          return (
            <li key={feedKey(note)}>
              <Link to={feedNoteLink(note)} state={{ from: pathname + search }} className="start-pinboard-link">
                <Icon name="pin" />
                <span className="start-pinboard-body">
                  <span className="start-pinboard-text">{note.text}</span>
                  <span className="start-pinboard-meta">
                    <AreaChip area={note.area} />
                    {meta && <span>{meta}</span>}
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
