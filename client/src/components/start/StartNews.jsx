import { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import Icon from '../Icon.jsx'
import FeedItem from '../feed/FeedItem.jsx'
import { groupBySeason } from '../../lib/seasons.js'
import { byMemoryDate } from '../../lib/feed.js'

// Zuerst so viele Erinnerungen, der Rest hinter "Weitere Erinnerungen" (die Seite bleibt so bei höchstens etwa drei
// Bildschirmhöhen).
export const START_FEED_VISIBLE = 6

// "Neue Erinnerungen" auf Start (B+ Familienalbum): die zuletzt festgehaltenen Erinnerungen (GET /api/timeline/recent) als
// Karten - nach dem Tag der Erinnerung sortiert und nach Jahreszeiten in Kapitel geteilt („Herbst 2026“ in Handschrift). entries null: lädt noch bzw. konnte nicht
// geladen werden (dann steht der Fehler darüber) - kein Leerzustand. Das Kapitel ist der Name der Liste (aria-label), die
// Handschrift darüber nur sein Bild.
export default function StartNews({ entries, loading }) {
  const { theme, words } = useTheme()
  const [showAll, setShowAll] = useState(false)
  const firstMore = useRef(null)
  // Nach dem Tag der Erinnerung sortiert (lib/feed.js byMemoryDate) - so folgen die Kapitel der Liste.
  const sorted = useMemo(() => (entries ? byMemoryDate(entries) : null), [entries])
  const hidden = sorted ? Math.max(0, sorted.length - START_FEED_VISIBLE) : 0
  const shown = sorted && !showAll ? sorted.slice(0, START_FEED_VISIBLE) : sorted
  const chapters = shown ? groupBySeason(shown) : []
  // Die erste nachgeladene Erinnerung (für den Fokus) - über alle Kapitel gezählt.
  const firstMoreId = showAll && sorted?.[START_FEED_VISIBLE]?.id

  // Nach "Weitere Erinnerungen" rückt der Fokus auf die erste nachgeladene (wie bei den Würfen).
  useEffect(() => {
    if (showAll) firstMore.current?.querySelector('a')?.focus()
  }, [showAll])

  return (
    <section className="start-news" aria-labelledby="start-news-title" aria-busy={loading || undefined}>
      <h2 id="start-news-title" className="start-section-title">
        Neue {words.entries}
      </h2>
      {entries?.length === 0 && (
        <div className="feed feed-empty">
          <Icon name="sprout" />
          <p>
            <strong>Noch keine {words.entries}.</strong> {theme.texts.feedEmpty} – hier steht dann alles Neue.
          </p>
        </div>
      )}
      {chapters.map((chapter) => (
        <div key={chapter.key} className="feed-chapter">
          {chapter.label && (
            <p className="feed-chapter-label hand" aria-hidden="true">
              {chapter.label}
            </p>
          )}
          <ul className="feed-cards" role="list" aria-label={chapter.label || undefined}>
            {chapter.items.map((entry) => (
              <FeedItem key={entry.id} entry={entry} itemRef={entry.id === firstMoreId ? firstMore : undefined} />
            ))}
          </ul>
        </div>
      ))}
      {!showAll && hidden > 0 && (
        <button type="button" className="btn btn-ghost start-more" onClick={() => setShowAll(true)}>
          Weitere {words.entries} ({hidden})
        </button>
      )}
    </section>
  )
}
