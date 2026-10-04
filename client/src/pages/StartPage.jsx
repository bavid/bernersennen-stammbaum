import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import AnimalCreateModal from '../components/AnimalCreateModal.jsx'
import HinweisStartZeile from '../components/hinweise/HinweisStartZeile.jsx'
import MyFamiliesCard from '../components/start/MyFamiliesCard.jsx'
import FrameStartCard from '../components/start/FrameStartCard.jsx'
import StartComposer from '../components/start/StartComposer.jsx'
import StartSoon from '../components/start/StartSoon.jsx'
import StartNews from '../components/start/StartNews.jsx'
import AnimalCircles from '../components/start/AnimalCircles.jsx'
import OnThisDayCard from '../components/start/OnThisDayCard.jsx'
import useAnimalCreate from '../hooks/useAnimalCreate.js'
import useStartFeed from '../hooks/useStartFeed.js'
import { areaContext } from '../lib/areas.js'
import { nextAnniversary } from '../lib/companions.js'
import { firstFramePhoto } from '../lib/bilderrahmen.js'
import { homeEntries, pinboardNews, upcomingTermine } from '../lib/startFeed.js'
import { todayIso } from '../lib/dates.js'
import { hasRole } from '../lib/roles.js'
import '../styles/start-feed.css'

export { START_FEED_VISIBLE } from '../components/start/StartNews.jsx'

// Die Tiere für die Kreise, den Composer und den Jahrestag (GET /api/dogs). null: lädt noch bzw. Fehler in error.
function useStartDogs() {
  const [state, setState] = useState({ dogs: null, error: null })
  useEffect(() => {
    let cancelled = false
    Promise.resolve()
      .then(() => api.listDogs())
      .then((dogs) => {
        if (!cancelled) setState({ dogs, error: null })
      })
      .catch((err) => {
        if (!cancelled) setState({ dogs: null, error: err.message })
      })
    return () => {
      cancelled = true
    }
  }, [])
  return state
}

// /start (Phase W, Look B+ Familienalbum) - die Startseite im eigenen Zuhause und beim klassischen Familien-Login: oben in
// Handschrift „Schön, dass ihr da seid“ mit dem Namen, darunter eure Tiere als Kreise (samt „Neu“), dann erzählen
// („Erinnerung festhalten“; offene Hinweise nur als schmale Zeile zur Glocke), „Heute vor einem Jahr“, „Bald“ (Termine,
// Jahrestag, „Neu an der Pinnwand“, Notizen) und die neuen Erinnerungen in Kapiteln - Phase W, Schritt 3: aus dem Zuhause,
// den Familien und den befreundeten Zuhause in einem Feed (GET /api/start, ohne Bereichswechsel); am Rand die eigenen
// Familien. Ein Haushalt sieht /start immer im eigenen Zuhause (AreaGate).
export default function StartPage({ family }) {
  const { dogs, error: dogsError } = useStartDogs()
  const feed = useStartFeed()
  const creator = useAnimalCreate()
  const atHome = areaContext(family) === 'home'
  const canWrite = hasRole(family, 'mitglied')
  const anniversary = useMemo(() => nextAnniversary(dogs || []), [dogs])
  const firstPage = feed.pages?.[0]
  const framePhoto = useMemo(() => firstFramePhoto(dogs, homeEntries(firstPage)), [dogs, firstPage])
  const termine = useMemo(() => upcomingTermine(feed.termine, todayIso()), [feed.termine])
  const notes = useMemo(() => pinboardNews(firstPage, termine), [firstPage, termine])
  const error = dogsError || feed.error
  // Eine eben festgehaltene Erinnerung steht im eigenen Zuhause (ohne Bereichs-Hinweis) oben im Feed.
  const addEntry = (entry) =>
    feed.addEntry({ ...entry, type: 'eintrag', area: { id: family.id, name: family.name, art: 'eigen' }, activity_at: entry.created_at })

  return (
    <div className="page start-page">
      <header className="start-greeting">
        <p className="start-greeting-hand hand">Schön, dass ihr da seid</p>
        <h1>
          <span className="visually-hidden">Start – </span>
          {family.name}
        </h1>
      </header>
      {dogs && <AnimalCircles dogs={dogs} canAdd={canWrite} onAdd={creator.open} />}
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <div className="start-layout">
        <div className="start-main">
          {/* Hinweis-Glocke: statt der „Für dich“-Kästen eine schmale Zeile, die das Fenster der Glocke öffnet. */}
          <HinweisStartZeile />
          {canWrite && dogs && <StartComposer family={family} dogs={dogs} onCreated={addEntry} />}
          <OnThisDayCard enabled={!family.zuBesuch} />
          <StartSoon termine={termine} anniversary={anniversary} notes={notes} notesCount={atHome ? feed.notizen : 0} />
          <StartNews
            pages={feed.pages}
            loading={feed.pages === null && !feed.error}
            hasMore={Boolean(feed.next)}
            onLoadMore={feed.loadMore}
            more={feed.more}
          />
        </div>
        {atHome && (
          <div className="start-side">
            <MyFamiliesCard memberships={family.memberships} />
            {framePhoto && <FrameStartCard photo={framePhoto} />}
          </div>
        )}
      </div>
      {canWrite && <AnimalCreateModal creator={creator} allDogs={dogs || []} ownFamilyId={family.id} />}
    </div>
  )
}
