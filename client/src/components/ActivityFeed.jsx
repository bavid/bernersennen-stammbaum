import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Avatar from './Avatar.jsx'
import Icon from './Icon.jsx'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { dogLabel } from '../lib/timeline.js'
import { formatTermin, relativeTime } from '../lib/dates.js'
import { originLabel } from '../lib/tierZuhause.js'
import { t } from '../lib/i18n/index.js'
import { Button } from './ui/index.js'

function toDog(entry) {
  return { name: entry.dog_name, name_unbekannt: entry.dog_name_unbekannt, rasse: entry.dog_rasse, foto_url: entry.dog_foto_url }
}

const MAX_TILES = 4

// "Was treiben die anderen?" – nächstes Treffen und die zuletzt geschriebenen Beiträge. limit: höchstens so viele Kacheln
// (Phase W: die Gruppenseite zeigt bis zu 20, sonst vier); terminTo: wohin das Treffen führt (die Pinnwand des Bereichs);
// title: Überschrift (Standard "Neu in der Familie" bzw. "Neu im Rudel" - zu Besuch in einem Zuhause passt das nicht).
// Ein Tier eines anderen Zuhauses trägt unter dem Namen, wo es wohnt (dog_zuhause, lib/tierZuhause.js) - das eigene nicht.
// visible (Audit W, Gruppenseite): zuerst nur so viele Kacheln, der Rest hinter "Weitere Erinnerungen (n)" - wie auf Start;
// danach rückt der Fokus auf die erste neu sichtbare Kachel.
export default function ActivityFeed({ entries: allEntries, termin, limit = MAX_TILES, visible = Infinity, terminTo = '/pinnwand', title }) {
  const { theme, words } = useTheme()
  const { pathname, search } = useLocation()
  const [showAll, setShowAll] = useState(false)
  const items = useRef(null)
  const heading = title || words.newsTitle
  const entries = allEntries.slice(0, termin ? limit - 1 : limit)
  const hidden = showAll ? 0 : Math.max(0, entries.length - visible)
  const shown = hidden > 0 ? entries.slice(0, visible) : entries

  useEffect(() => {
    if (showAll) items.current?.querySelectorAll('.feed-item:not(.feed-termin)')[visible]?.focus()
  }, [showAll, visible])

  if (!entries.length && !termin) {
    return (
      <section className="feed feed-empty" aria-label={heading}>
        <Icon name="sprout" />
        <p>
          <strong>{t('Noch keine Neuigkeiten.')}</strong> {theme.texts.feedEmpty} – {t('die anderen sehen es dann hier.')}
        </p>
      </section>
    )
  }

  return (
    <section className="feed" aria-labelledby="feed-title">
      <h2 id="feed-title" className="feed-title">
        {heading}
      </h2>
      <div className="feed-items" ref={items}>
        {termin && (
          <Link to={terminTo} className="feed-item feed-termin">
            <span className="feed-termin-icon">
              <Icon name="calendar" />
            </span>
            <span className="feed-body">
              <span className="feed-kicker">{t('Nächstes Treffen')}</span>
              <span className="feed-headline">{formatTermin(termin.termin_datum, termin.termin_zeit, { short: true })}</span>
              <span className="feed-meta">{termin.text}</span>
            </span>
          </Link>
        )}
        {shown.map((entry) => (
          <Link key={entry.id} to={`/tier/${entry.dog_id}#entry-${entry.id}`} state={{ from: pathname + search }} className="feed-item">
            <Avatar dog={toDog(entry)} size={44} />
            <span className="feed-body">
              <span className="feed-kicker">{dogLabel(toDog(entry))}</span>
              {entry.dog_zuhause && <span className="feed-origin">{originLabel(entry.dog_zuhause)}</span>}
              <span className="feed-headline">{entry.titel}</span>
              <span className="feed-meta">
                {entry.autor_name} · {relativeTime(entry.created_at)}
                {entry.comment_count > 0 &&
                  ` · ${entry.comment_count} ${entry.comment_count === 1 ? words.greeting : words.greetings}`}
              </span>
            </span>
          </Link>
        ))}
      </div>
      {hidden > 0 && (
        <Button type="button" variant="ghost" className="feed-more" onClick={() => setShowAll(true)}>
          {t('Weitere {entries} ({n})', { entries: words.entries, n: hidden })}
        </Button>
      )}
    </section>
  )
}
