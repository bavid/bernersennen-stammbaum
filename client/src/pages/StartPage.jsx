import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import Icon from '../components/Icon.jsx'
import Lightbox from '../components/Lightbox.jsx'
import FeedItem from '../components/feed/FeedItem.jsx'
import ForYou from '../components/start/ForYou.jsx'
import MyFamiliesCard from '../components/start/MyFamiliesCard.jsx'
import FrameStartCard from '../components/start/FrameStartCard.jsx'
import StartComposer from '../components/start/StartComposer.jsx'
import StartSoon from '../components/start/StartSoon.jsx'
import { HOME_LABEL, areaContext } from '../lib/areas.js'
import { nextAnniversary } from '../lib/companions.js'
import { nextTermin } from '../lib/notes.js'
import { firstFramePhoto } from '../lib/bilderrahmen.js'
import { hasRole } from '../lib/roles.js'

// So viele Beiträge lädt "Neuigkeiten" (GET /api/timeline/recent, höchstens 20) - sichtbar sind zuerst START_FEED_VISIBLE,
// der Rest hinter "Weitere Neuigkeiten" (die Seite bleibt so bei höchstens etwa drei Bildschirmhöhen).
export const START_FEED_LIMIT = 20
export const START_FEED_VISIBLE = 6

function useStartData() {
  const [data, setData] = useState({ dogs: null, entries: null, notes: [], error: null })
  useEffect(() => {
    let cancelled = false
    Promise.resolve()
      .then(() => Promise.all([api.listDogs(), api.recentActivity(START_FEED_LIMIT), api.listNotes()]))
      .then(([dogs, entries, notes]) => {
        if (!cancelled) setData({ dogs, entries, notes, error: null })
      })
      .catch((err) => {
        if (!cancelled) setData((current) => ({ ...current, error: err.message }))
      })
    return () => {
      cancelled = true
    }
  }, [])
  const addEntry = (entry) => setData((current) => ({ ...current, entries: [entry, ...(current.entries || [])] }))
  return [data, addEntry]
}

// entries null: lädt noch bzw. konnte nicht geladen werden (dann steht der Fehler darüber) - kein Leerzustand.
function News({ entries, loading }) {
  const { theme } = useTheme()
  const [showAll, setShowAll] = useState(false)
  const firstMore = useRef(null)
  const hidden = entries ? Math.max(0, entries.length - START_FEED_VISIBLE) : 0
  const shown = entries && !showAll ? entries.slice(0, START_FEED_VISIBLE) : entries

  // Nach "Weitere Neuigkeiten" rückt der Fokus auf den ersten nachgeladenen Beitrag (wie bei den Würfen).
  useEffect(() => {
    if (showAll) firstMore.current?.querySelector('a')?.focus()
  }, [showAll])

  return (
    <section className="start-news" aria-labelledby="start-news-title" aria-busy={loading || undefined}>
      <h2 id="start-news-title" className="start-section-title">
        Neuigkeiten
      </h2>
      {entries?.length === 0 && (
        <div className="feed feed-empty">
          <Icon name="sprout" />
          <p>
            <strong>Noch keine Neuigkeiten.</strong> {theme.texts.feedEmpty} – hier steht dann alles Neue.
          </p>
        </div>
      )}
      {shown?.length > 0 && (
        <ul className="feed-cards" role="list">
          {shown.map((entry, index) => (
            <FeedItem key={entry.id} entry={entry} itemRef={showAll && index === START_FEED_VISIBLE ? firstMore : undefined} />
          ))}
        </ul>
      )}
      {!showAll && hidden > 0 && (
        <button type="button" className="btn btn-ghost start-more" onClick={() => setShowAll(true)}>
          Weitere Neuigkeiten ({hidden})
        </button>
      )}
    </section>
  )
}

// /start (Phase W) - die Startseite im eigenen Zuhause und beim klassischen Familien-Login: oben erzählen ("Was erlebt
// euer Tier?"), darunter "Für dich" (Anfragen, neue Gäste), "Bald" (Termin, Jahrestag, Notizen) und die Neuigkeiten des
// Bereichs als Karten; am Rand die eigenen Familien. Ein Haushalt sieht /start immer im eigenen Zuhause (AreaGate).
export default function StartPage({ family, onFamilyChange }) {
  const [{ dogs, entries, notes, error }, addEntry] = useStartData()
  const [photo, setPhoto] = useState(null)
  const atHome = areaContext(family) === 'home'
  const canWrite = hasRole(family, 'mitglied')
  const anniversary = useMemo(() => nextAnniversary(dogs || []), [dogs])
  const termin = useMemo(() => nextTermin(notes), [notes])
  const framePhoto = useMemo(() => firstFramePhoto(dogs, entries), [dogs, entries])

  return (
    <div className="page start-page">
      <h1 className="visually-hidden">Start – {atHome ? HOME_LABEL : family.name}</h1>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <div className="start-layout">
        <div className="start-main">
          {canWrite && dogs && <StartComposer family={family} dogs={dogs} onCreated={addEntry} />}
          <ForYou family={family} onFamilyChange={onFamilyChange} onOpenPhoto={setPhoto} />
          <StartSoon termin={termin} anniversary={anniversary} notesCount={atHome ? notes.length : 0} />
          <News entries={entries} loading={entries === null && !error} />
        </div>
        {atHome && (
          <div className="start-side">
            <MyFamiliesCard memberships={family.memberships} />
            {framePhoto && <FrameStartCard photo={framePhoto} />}
          </div>
        )}
      </div>
      <Lightbox src={photo} onClose={() => setPhoto(null)} />
    </div>
  )
}
