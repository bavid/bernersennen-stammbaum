import { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import Icon from '../Icon.jsx'
import FeedItem from '../feed/FeedItem.jsx'
import { groupBySeason } from '../../lib/seasons.js'
import { byMemoryDate } from '../../lib/feed.js'
import { feedEntries, feedKey } from '../../lib/startFeed.js'
import { t } from '../../lib/i18n/index.js'
import { Button } from '../ui/index.js'

// Zuerst so viele Erinnerungen, der Rest hinter "Weitere Erinnerungen" (die Seite bleibt so bei höchstens etwa drei
// Bildschirmhöhen).
export const START_FEED_VISIBLE = 5

// "Neue Erinnerungen" auf Start (B+ Familienalbum, Phase W Schritt 3): die Erinnerungen aus dem Zuhause, den Familien und
// den befreundeten Zuhause (GET /api/start, hooks/useStartFeed.js; Zettel stehen in StartPinboard) als Karten - je
// geladener Seite nach dem Tag der Erinnerung sortiert und nach Jahreszeiten in Kapitel geteilt („Herbst 2026“ in
// Handschrift). Eine weitere Seite („Ältere anzeigen“) kommt darunter, nie dazwischen. pages null: lädt noch bzw. konnte
// nicht geladen werden (dann steht der Fehler darüber) - kein Leerzustand. Das Kapitel ist der Name der Liste
// (aria-label), die Handschrift darüber nur sein Bild. Nach „Weitere Erinnerungen“ bzw. „Ältere anzeigen“ rückt der Fokus
// auf die erste neu sichtbare Karte.
// filter: die Chips „Alle · Mein Zuhause · …“ (StartAreaFilter) direkt unter der Überschrift - die Seiten kommen dann schon
// gefiltert (pages), Kapitel und „Weitere“ rechnen wie gewohnt.
export default function StartNews({ pages, loading, hasMore = false, onLoadMore, more = {}, filter = null }) {
  const { theme, words } = useTheme()
  const [showAll, setShowAll] = useState(false)
  const [focusKey, setFocusKey] = useState(null)
  const focusRef = useRef(null)
  const mounted = useRef(true)
  const sorted = useMemo(() => (pages ? pages.flatMap((page) => byMemoryDate(feedEntries(page))) : null), [pages])
  const hidden = sorted ? Math.max(0, sorted.length - START_FEED_VISIBLE) : 0
  const shown = sorted && !showAll ? sorted.slice(0, START_FEED_VISIBLE) : sorted
  const chapters = shown ? groupBySeason(shown) : []

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (focusKey) focusRef.current?.querySelector('a')?.focus()
  }, [focusKey])

  function revealAll() {
    setShowAll(true)
    setFocusKey(sorted[START_FEED_VISIBLE] ? feedKey(sorted[START_FEED_VISIBLE]) : null)
  }

  async function loadOlder() {
    const added = feedEntries(await onLoadMore?.())
    if (mounted.current && added.length > 0) {
      setShowAll(true)
      setFocusKey(feedKey(byMemoryDate(added)[0]))
    }
  }

  const refFor = (item) => (feedKey(item) === focusKey ? focusRef : undefined)

  return (
    <section id="start-news" className="start-news" aria-labelledby="start-news-title" aria-busy={loading || more.loading || undefined}>
      <h2 id="start-news-title" className="start-section-title">
        {t('Neue {entries}', { entries: words.entries })}
      </h2>
      {filter}
      {sorted?.length === 0 && !hasMore && (
        <div className="feed feed-empty">
          <Icon name="sprout" />
          <p>
            <strong>{t('Noch keine {entries}.', { entries: words.entries })}</strong> {theme.texts.feedEmpty} – {t('hier steht dann alles Neue.')}
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
              <FeedItem key={feedKey(entry)} entry={entry} itemRef={refFor(entry)} />
            ))}
          </ul>
        </div>
      ))}
      {!showAll && hidden > 0 && (
        <Button type="button" variant="ghost" className="start-more" onClick={revealAll}>
          {t('Weitere {entries} ({n})', { entries: words.entries, n: hidden })}
        </Button>
      )}
      {(showAll || hidden === 0) && hasMore && (
        <Button type="button" variant="ghost" className="start-more" onClick={loadOlder} aria-disabled={more.loading || undefined}>
          {more.loading ? t('Lädt …') : t('Ältere anzeigen')}
        </Button>
      )}
      {more.error && (
        <p className="start-more-error" role="alert">
          {more.error}
        </p>
      )}
    </section>
  )
}
