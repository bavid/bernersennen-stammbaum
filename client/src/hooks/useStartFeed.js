import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { appendPage, feedKey, toFeedItem } from '../lib/startFeed.js'

const toItems = (feed) => (Array.isArray(feed?.items) ? feed.items.map(toFeedItem) : [])

// Der Feed von Start (GET /api/start): Seiten mit Erinnerungen und Zetteln aus allen Bereichen des Haushalts, dazu die
// nächsten Termine und die Zahl der Zettel an der eigenen Pinnwand. pages null: lädt noch (bzw. Fehler in error).
// loadMore holt mit dem Cursor die nächste Seite und gibt die neu hinzugekommenen Einträge zurück ([] bei einem Fehler -
// der steht dann in more.error, und „Ältere anzeigen“ lässt sich noch einmal versuchen). addEntry: eine eben im Zuhause
// festgehaltene Erinnerung oben auf die erste Seite.
export default function useStartFeed() {
  const [feed, setFeed] = useState({ pages: null, termine: [], notizen: 0, next: null, error: null })
  const [more, setMore] = useState({ loading: false, error: null })
  const mounted = useRef(true)
  const loadingMore = useRef(false)

  useEffect(() => {
    mounted.current = true
    let cancelled = false
    Promise.resolve()
      .then(() => api.start())
      .then((result) => {
        if (cancelled) return
        setFeed({
          pages: [toItems(result)],
          termine: Array.isArray(result?.termine) ? result.termine : [],
          notizen: Number.isInteger(result?.notizen) ? result.notizen : 0,
          next: result?.next || null,
          error: null
        })
      })
      .catch((err) => {
        if (!cancelled) setFeed((current) => ({ ...current, error: err.message }))
      })
    return () => {
      cancelled = true
      mounted.current = false
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (!feed.next || loadingMore.current) return []
    loadingMore.current = true
    setMore({ loading: true, error: null })
    try {
      const result = await api.start({ vor: feed.next })
      if (!mounted.current) return []
      const loaded = feed.pages ? feed.pages.flat() : []
      const added = appendPage(loaded, toItems(result)).slice(loaded.length)
      setFeed((current) => ({ ...current, pages: [...(current.pages || []), added], next: result?.next || null }))
      setMore({ loading: false, error: null })
      return added
    } catch (err) {
      if (mounted.current) setMore({ loading: false, error: err.message })
      return []
    } finally {
      loadingMore.current = false
    }
  }, [feed.next, feed.pages])

  const addEntry = useCallback((entry) => {
    setFeed((current) => {
      const [first = [], ...rest] = current.pages || []
      const fresh = first.filter((item) => feedKey(item) !== feedKey(entry))
      return { ...current, pages: [[entry, ...fresh], ...rest] }
    })
  }, [])

  return { ...feed, more, loadMore, addEntry }
}
