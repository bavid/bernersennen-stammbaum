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
import { areaContext } from '../lib/areas.js'
import { nextAnniversary } from '../lib/companions.js'
import { nextTermin } from '../lib/notes.js'
import { firstFramePhoto } from '../lib/bilderrahmen.js'
import { hasRole } from '../lib/roles.js'

export { START_FEED_VISIBLE } from '../components/start/StartNews.jsx'

// So viele Erinnerungen lädt Start (GET /api/timeline/recent, höchstens 20) - sichtbar sind zuerst START_FEED_VISIBLE.
export const START_FEED_LIMIT = 20

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

// /start (Phase W, Look B+ Familienalbum) - die Startseite im eigenen Zuhause und beim klassischen Familien-Login: oben in
// Handschrift „Schön, dass ihr da seid“ mit dem Namen, darunter eure Tiere als Kreise (samt „Neu“), dann erzählen
// („Erinnerung festhalten“; offene Hinweise nur als schmale Zeile zur Glocke), „Heute vor einem Jahr“, „Bald“ (Termin, Jahrestag,
// Notizen) und die neuen Erinnerungen in Kapiteln; am Rand die eigenen Familien. Ein Haushalt sieht /start immer im
// eigenen Zuhause (AreaGate).
export default function StartPage({ family }) {
  const [{ dogs, entries, notes, error }, addEntry] = useStartData()
  const creator = useAnimalCreate()
  const atHome = areaContext(family) === 'home'
  const canWrite = hasRole(family, 'mitglied')
  const anniversary = useMemo(() => nextAnniversary(dogs || []), [dogs])
  const termin = useMemo(() => nextTermin(notes), [notes])
  const framePhoto = useMemo(() => firstFramePhoto(dogs, entries), [dogs, entries])

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
          <StartSoon termin={termin} anniversary={anniversary} notesCount={atHome ? notes.length : 0} />
          <StartNews entries={entries} loading={entries === null && !error} />
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
