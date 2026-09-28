import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import Avatar from '../components/Avatar.jsx'
import BreedingRecords from '../components/BreedingRecords.jsx'
import Icon from '../components/Icon.jsx'
import LitterCard from '../components/LitterCard.jsx'
import Lightbox from '../components/Lightbox.jsx'
import { useToast } from '../components/Toast.jsx'
import { formatDateLong } from '../lib/dates.js'
import { buildLitters, latestEntries, photosByAge } from '../lib/litters.js'
import { displayName, shortName } from '../lib/timeline.js'

function PlannedLitter({ planned }) {
  const { event, expectedBirth, daysUntil } = planned
  const father = event.vater_name || event.vater_freitext || 'unbekannter Rüde'
  const status =
    daysUntil > 0
      ? `Welpen in etwa ${daysUntil} ${daysUntil === 1 ? 'Tag' : 'Tagen'} (um den ${formatDateLong(expectedBirth)})`
      : 'Die Welpen müssten jetzt da sein – Zeit für neue Karten im Stammbaum!'
  return (
    <li className="planned-litter">
      <Icon name="sprout" />
      <div>
        <p className="planned-pair">
          {shortName(event.mutter_name)} × {shortName(father)}
        </p>
        <p className="muted">
          Deckakt {formatDateLong(event.datum)} · {status}
        </p>
      </div>
    </li>
  )
}

export default function LittersPage() {
  const { words } = useTheme()
  const [dogs, setDogs] = useState(null)
  const [allDogs, setAllDogs] = useState([])
  const [events, setEvents] = useState([])
  const [entries, setEntries] = useState([])
  const [error, setError] = useState(null)
  const [photo, setPhoto] = useState(null)
  const navigate = useNavigate()
  const toast = useToast()

  useEffect(() => {
    Promise.all([api.listDogs(), api.listAllDogs(), api.listBreedingEvents(), api.listTimeline()])
      .then(([own, all, breeding, timeline]) => {
        setDogs(own)
        setAllDogs(all)
        setEvents(breeding)
        setEntries(timeline)
      })
      .catch((err) => setError(err.message))
  }, [])

  const { litters, planned } = useMemo(() => buildLitters(dogs || [], events), [dogs, events])
  // Nur Würfe mit mindestens zwei Geschwistern im Rudel lohnen eine Karte; Einzelne stehen kompakt darunter
  const withSiblings = litters.filter((litter) => litter.puppies.length > 1)
  const singles = litters.filter((litter) => litter.puppies.length === 1)
  const latest = useMemo(() => latestEntries(entries), [entries])

  // Wurf-Geburtstag: Zettel für die Pinnwand vorbereiten
  function planMeeting(litter, birthday) {
    const names = litter.puppies.map(displayName).join(', ').replace(/, ([^,]*)$/, ' und $1')
    navigate('/pinnwand', {
      state: {
        draft: {
          text: `Wurftreffen! ${names} werden am ${formatDateLong(birthday.date)} ${birthday.age} ${birthday.age === 1 ? 'Jahr' : 'Jahre'} alt – wer ist dabei?`,
          terminDatum: birthday.date
        }
      }
    })
  }

  function handleCreated(created) {
    setEvents((current) => [created, ...current].sort((a, b) => (a.datum < b.datum ? 1 : -1)))
    toast('Deckakt eingetragen')
  }

  async function handleDelete(event) {
    try {
      await api.deleteBreedingEvent(event.id)
      setEvents((current) => current.filter((e) => e.id !== event.id))
      toast('Eintrag gelöscht')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="page">
      <header className="page-hero">
        <div>
          <span className="eyebrow">Würfe</span>
          <h1>Geschwister auf einen Blick</h1>
          <p className="page-lede">
            Jeder Wurf mit allen Geschwistern: was sie gerade treiben und wie sie im gleichen Alter aussahen. Entsteht
            automatisch aus dem Stammbaum – eintragen muss man nichts.
          </p>
        </div>
      </header>

      {error && <div className="error-banner" role="alert">{error}</div>}

      {planned.length > 0 && (
        <section className="planned-litters" aria-labelledby="planned-title">
          <h2 id="planned-title" className="section-title">
            Erwartet
          </h2>
          <ul className="planned-list">
            {planned.map((item) => (
              <PlannedLitter key={item.event.id} planned={item} />
            ))}
          </ul>
        </section>
      )}

      {dogs && withSiblings.length === 0 && (
        <p className="empty-state">
          Noch keine Würfe: Sobald im Stammbaum Geschwister mit gleichen Eltern und gleichem Geburtstag stehen,
          erscheinen sie hier.
        </p>
      )}

      <div className="litter-list">
        {withSiblings.map((litter) => (
          <LitterCard
            key={litter.key}
            litter={litter}
            latest={latest}
            stages={photosByAge(litter, entries)}
            onPlanMeeting={planMeeting}
            onOpenPhoto={setPhoto}
          />
        ))}
      </div>

      {singles.length > 0 && (
        <section className="litter-singles" aria-labelledby="singles-title">
          <h2 id="singles-title" className="section-title">
            Ohne Geschwister {words.inGroup}
          </h2>
          <p className="muted">Von diesen Würfen steht bisher nur ein Tier im Stammbaum.</p>
          <ul className="chip-list">
            {singles.map((litter) => {
              const [dog] = litter.puppies
              const parents = [litter.mother?.name, litter.father?.name].filter(Boolean).join(' × ')
              return (
                <li key={litter.key}>
                  <Link to={`/tier/${dog.id}`} className="chip">
                    <Avatar dog={dog} size={24} />
                    {displayName(dog)}
                    {parents && <span className="muted"> · von {parents}</span>}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {dogs && (
        <BreedingRecords
          events={events}
          ownDogs={dogs}
          allDogs={allDogs}
          onCreated={handleCreated}
          onDelete={handleDelete}
          onOpenPhoto={setPhoto}
        />
      )}

      <Lightbox src={photo} onClose={() => setPhoto(null)} />
    </div>
  )
}
