import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import AnimalCreateModal from '../components/AnimalCreateModal.jsx'
import MyFamiliesCard from '../components/start/MyFamiliesCard.jsx'
import FrameStartCard from '../components/start/FrameStartCard.jsx'
import StartComposer from '../components/start/StartComposer.jsx'
import StartSoon from '../components/start/StartSoon.jsx'
import StartNews from '../components/start/StartNews.jsx'
import StartAreaFilter from '../components/start/StartAreaFilter.jsx'
import AnimalCircles from '../components/start/AnimalCircles.jsx'
import OnThisDayCard from '../components/start/OnThisDayCard.jsx'
import FirstMemoryCard from '../components/start/FirstMemoryCard.jsx'
import useAnimalCreate from '../hooks/useAnimalCreate.js'
import useGroupParam from '../hooks/useGroupParam.js'
import useStartFeed from '../hooks/useStartFeed.js'
import { HOME_LABEL, areaContext, isHouseholdIdentity } from '../lib/areas.js'
import { nextAnniversary } from '../lib/companions.js'
import { firstFramePhoto } from '../lib/bilderrahmen.js'
import { homeEntries, pinboardNews, upcomingTermine } from '../lib/startFeed.js'
import { areaOptions, filterPages, selectedAreaParam } from '../lib/startFilter.js'
import { todayIso } from '../lib/dates.js'
import { hasRole } from '../lib/roles.js'
import { isFirstMemorySkipped, needsFirstMemory } from '../lib/firstMemory.js'
import '../styles/start-feed.css'
import { t } from '../lib/i18n/index.js'

export { START_FEED_VISIBLE } from '../components/start/StartNews.jsx'

// Die Tiere für die Kreise, den Composer und den Jahrestag (GET /api/dogs). null: lädt noch bzw. Fehler in error.
// addDog: ein eben (bei der ersten Erinnerung) angelegtes Tier dazu.
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
  const addDog = useCallback((dog) => setState((current) => ({ ...current, dogs: [...(current.dogs || []), dog] })), [])
  return { ...state, addDog }
}

// Feed-Eintrag aus der Antwort von POST /api/timeline samt Tier-Angaben (wie StartComposer).
const withDog = (entry, dog) => ({
  comment_count: 0,
  ...entry,
  dog_id: dog.id,
  dog_name: dog.name,
  dog_name_unbekannt: dog.name_unbekannt,
  dog_rasse: dog.rasse,
  dog_foto_url: dog.foto_url
})

// „Eure erste Erinnerung“: nur im eigenen Zuhause, mit Schreibrecht, solange dort keine Erinnerung steht und die Karte nicht
// weggelegt ist. Nach dem Festhalten bleibt sie (mit der Freude) stehen, bis man die Seite verlässt.
function useFirstMemory(family, { canWrite, atHome, dogs, feed }) {
  const [skipped, setSkipped] = useState(() => isFirstMemorySkipped(family.id))
  const [done, setDone] = useState(false)
  const eligible = canWrite && atHome && !family.zuBesuch && Boolean(dogs) && !skipped
  const show = eligible && (done || needsFirstMemory(feed))
  return { show, skip: () => setSkipped(true), markDone: () => setDone(true) }
}

// /start (Phase W, Look B+ Familienalbum) - die Startseite im eigenen Zuhause und beim klassischen Familien-Login: oben in
// Handschrift „Schön, dass ihr da seid“ mit dem Namen, darunter eure Tiere als Kreise (samt „Neu“), dann erzählen
// („Erinnerung festhalten“; offene Hinweise nur als schmale Zeile zur Glocke), „Heute vor einem Jahr“, „Bald“ (Termine,
// Jahrestag, „Neu an der Pinnwand“, Notizen) und die neuen Erinnerungen in Kapiteln - Phase W, Schritt 3: aus dem Zuhause,
// den Familien und den befreundeten Zuhause in einem Feed (GET /api/start, ohne Bereichswechsel); am Rand die eigenen
// Familien. Ein Haushalt sieht /start immer im eigenen Zuhause (AreaGate).
// Filter nach Zuhause über den Erinnerungen (StartAreaFilter, ?gruppe=…): die Chips kommen aus den geladenen Einträgen und
// stehen nur, wenn Erinnerungen aus mehr als einem Zuhause da sind; gefiltert wird im Browser (lib/startFilter.js).
export default function StartPage({ family }) {
  const { dogs, error: dogsError, addDog } = useStartDogs()
  const feed = useStartFeed()
  const creator = useAnimalCreate()
  const [requestedArea] = useGroupParam()
  const atHome = areaContext(family) === 'home'
  const canWrite = hasRole(family, 'mitglied')
  const anniversary = useMemo(() => nextAnniversary(dogs || []), [dogs])
  const ownLabel = isHouseholdIdentity(family) ? t(HOME_LABEL) : family.name
  const areaChips = useMemo(() => areaOptions((feed.pages || []).flat(), { ownLabel }), [feed.pages, ownLabel])
  const areaParam = selectedAreaParam(requestedArea, areaChips)
  const shownPages = useMemo(() => filterPages(feed.pages, areaParam), [feed.pages, areaParam])
  const firstPage = feed.pages?.[0]
  const framePhoto = useMemo(() => firstFramePhoto(dogs, homeEntries(firstPage)), [dogs, firstPage])
  const termine = useMemo(() => upcomingTermine(feed.termine, todayIso()), [feed.termine])
  const notes = useMemo(() => pinboardNews(firstPage, termine), [firstPage, termine])
  const error = dogsError || feed.error
  const firstMemory = useFirstMemory(family, { canWrite, atHome, dogs, feed })
  // Eine eben festgehaltene Erinnerung steht im eigenen Zuhause (ohne Bereichs-Hinweis) oben im Feed.
  const addEntry = (entry) =>
    feed.addEntry({ ...entry, type: 'eintrag', area: { id: family.id, name: family.name, art: 'eigen' }, activity_at: entry.created_at })
  const addFirstMemory = (entry, newDog) => {
    if (newDog) addDog(newDog)
    const dog = newDog || dogs.find((candidate) => candidate.id === entry.dog_id) || { id: entry.dog_id }
    firstMemory.markDone()
    addEntry(withDog(entry, dog))
  }

  return (
    <div className="page start-page">
      <header className="start-greeting">
        <p className="start-greeting-hand hand">{t('Schön, dass ihr da seid')}</p>
        <h1>
          <span className="visually-hidden">{t('Start')} – </span>
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
          {firstMemory.show && <FirstMemoryCard family={family} dogs={dogs} onCreated={addFirstMemory} onSkip={firstMemory.skip} />}
          {canWrite && dogs && !firstMemory.show && <StartComposer family={family} dogs={dogs} onCreated={addEntry} />}
          <OnThisDayCard enabled={!family.zuBesuch} />
          <StartSoon termine={termine} anniversary={anniversary} notes={notes} notesCount={atHome ? feed.notizen : 0} />
          <StartNews
            pages={shownPages}
            loading={feed.pages === null && !feed.error}
            hasMore={Boolean(feed.next)}
            onLoadMore={feed.loadMore}
            more={feed.more}
            filter={<StartAreaFilter options={areaChips} controls="start-news" />}
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
