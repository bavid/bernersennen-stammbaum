import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import Avatar from '../components/Avatar.jsx'
import BreedingRecords from '../components/BreedingRecords.jsx'
import Icon from '../components/Icon.jsx'
import LitterCard from '../components/LitterCard.jsx'
import Lightbox from '../components/Lightbox.jsx'
import { TREE_PARAM, TREE_VALUE } from '../components/families/TreeToggle.jsx'
import { useToast } from '../components/Toast.jsx'
import { formatDateLong } from '../lib/dates.js'
import {
  MATING_MOTHER_PARAM,
  MATING_REQUEST_PARAM,
  MATING_REQUEST_VALUE,
  buildLitters,
  latestEntries,
  photosByAge,
  splitLitters
} from '../lib/litters.js'
import { hasRole } from '../lib/roles.js'
import { displayName, shortName } from '../lib/timeline.js'
import { t } from '../lib/i18n/index.js'

function PlannedLitter({ planned }) {
  const { theme, words } = useTheme()
  const { event, expectedBirth, daysUntil } = planned
  const father = event.vater_name || event.vater_freitext || t('unbekannter Rüde')
  const status =
    daysUntil > 0
      ? t(daysUntil === 1 ? '{young} in etwa {n} Tag (um den {date})' : '{young} in etwa {n} Tagen (um den {date})', {
          young: words.young,
          n: daysUntil,
          date: formatDateLong(expectedBirth)
        })
      : theme.texts.plannedDue
  return (
    <li className="planned-litter">
      <Icon name="sprout" />
      <div>
        <p className="planned-pair">
          {shortName(event.mutter_name)} × {shortName(father)}
        </p>
        <p className="muted">
          {words.mating} {formatDateLong(event.datum)} · {status}
        </p>
      </div>
    </li>
  )
}

// family: der aktive Bereich (AreaRoutes). Verpaarungen eintragen und löschen ab Mitglied (Phase R) - ein Gast
// sieht sie nur. Wörter "Nachwuchs"/"Verpaarung" (Phase U); oben führt ein Link zurück zur Familienbande - dorthin, wo
// der Nachwuchs steht (Familienbande 2: beim Stammbaum; ohne Stammbaum zeigt die Familienbande die Familien).
// ?verpaarung=neu (Familienbande 2, lib/litters.js addMatingPath - von der Tierseite und vom Nachwuchs beim Stammbaum)
// öffnet das Formular gleich, &mutter=<id> wählt die Hündin vor.
export default function LittersPage({ family }) {
  const { theme, words } = useTheme()
  const canWrite = hasRole(family, 'mitglied')
  const [searchParams, setSearchParams] = useSearchParams()
  const [matingRequest, setMatingRequest] = useState(null)
  const requestCount = useRef(0)
  const [dogs, setDogs] = useState(null)
  const [allDogs, setAllDogs] = useState([])
  const [events, setEvents] = useState([])
  const [entries, setEntries] = useState([])
  const [error, setError] = useState(null)
  const [photo, setPhoto] = useState(null)
  const navigate = useNavigate()
  const toast = useToast()

  // Den Wunsch aus der Adresse einmal einlösen (wer eintragen darf, bekommt das offene Formular) und danach aus der
  // Adresse nehmen - Neuladen oder Zurück öffnet es dann nicht noch einmal.
  useEffect(() => {
    if (searchParams.get(MATING_REQUEST_PARAM) !== MATING_REQUEST_VALUE) return
    if (canWrite) {
      requestCount.current += 1
      setMatingRequest({ key: requestCount.current, mother: Number(searchParams.get(MATING_MOTHER_PARAM)) || null })
    }
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete(MATING_REQUEST_PARAM)
        next.delete(MATING_MOTHER_PARAM)
        return next
      },
      { replace: true }
    )
  }, [searchParams, canWrite, setSearchParams])

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
  // Zuerst die neuesten Würfe (und ältere mit baldigem Geburtstag), der Rest auf "Mehr anzeigen" - danach rückt der
  // Fokus auf die erste nachgeladene Karte.
  const [showAllLitters, setShowAllLitters] = useState(false)
  const firstRevealed = useRef(null)
  const split = splitLitters(withSiblings)
  const shownLitters = showAllLitters ? withSiblings : split.visible
  const firstHiddenKey = split.hidden[0]?.key

  useEffect(() => {
    if (showAllLitters) firstRevealed.current?.focus()
  }, [showAllLitters])

  // Wurf-Geburtstag: Zettel für die Pinnwand vorbereiten
  function planMeeting(litter, birthday) {
    const names = litter.puppies.map(displayName).join(', ').replace(/, ([^,]*)$/, ` ${t('und')} $1`)
    navigate('/pinnwand', {
      state: {
        draft: {
          text: t(birthday.age === 1 ? '{meeting}! {names} werden am {date} {n} Jahr alt – wer ist dabei?' : '{meeting}! {names} werden am {date} {n} Jahre alt – wer ist dabei?', {
            meeting: words.litterMeeting,
            names,
            date: formatDateLong(birthday.date),
            n: birthday.age
          }),
          terminDatum: birthday.date
        }
      }
    })
  }

  function handleCreated(created) {
    setEvents((current) => [created, ...current].sort((a, b) => (a.datum < b.datum ? 1 : -1)))
    toast(words.matingAdded)
  }

  async function handleDelete(event) {
    try {
      await api.deleteBreedingEvent(event.id)
      setEvents((current) => current.filter((e) => e.id !== event.id))
      toast(t('{mating} gelöscht', { mating: words.mating }))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="page">
      <Link to={{ pathname: '/stammbaum', search: `?${TREE_PARAM}=${TREE_VALUE}` }} className="back-link">
        <Icon name="arrowLeft" /> {words.treeLabel}
      </Link>
      <header className="page-hero">
        <div>
          <span className="eyebrow">{words.littersLabel}</span>
          <h1>{t('Geschwister auf einen Blick')}</h1>
          <p className="page-lede">{theme.texts.littersLede}</p>
        </div>
      </header>

      {error && <div className="error-banner" role="alert">{error}</div>}

      {planned.length > 0 && (
        <section className="planned-litters" aria-labelledby="planned-title">
          <h2 id="planned-title" className="section-title">
            {t('Erwartet')}
          </h2>
          <ul className="planned-list">
            {planned.map((item) => (
              <PlannedLitter key={item.event.id} planned={item} />
            ))}
          </ul>
        </section>
      )}

      {dogs && withSiblings.length === 0 && (
        <p className="empty-state">{theme.texts.littersEmpty}</p>
      )}

      <div className="litter-list">
        {shownLitters.map((litter) => (
          <LitterCard
            key={litter.key}
            litter={litter}
            latest={latest}
            stages={photosByAge(litter, entries)}
            onPlanMeeting={planMeeting}
            onOpenPhoto={setPhoto}
            cardRef={showAllLitters && litter.key === firstHiddenKey ? firstRevealed : undefined}
          />
        ))}
        {!showAllLitters && split.hidden.length > 0 && (
          <button type="button" className="btn btn-ghost litter-more" onClick={() => setShowAllLitters(true)}>
            {split.hidden.length === 1 ? t('Mehr anzeigen ({n} weiterer)', { n: 1 }) : t('Mehr anzeigen ({n} weitere)', { n: split.hidden.length })}
            <span className="visually-hidden"> – {words.littersLabel}</span>
          </button>
        )}
      </div>

      {singles.length > 0 && (
        <section className="litter-singles" aria-labelledby="singles-title">
          <h2 id="singles-title" className="section-title">
            {t('Ohne Geschwister {inGroup}', { inGroup: words.inGroup })}
          </h2>
          <p className="muted">{theme.texts.littersSingles}</p>
          <ul className="chip-list">
            {singles.map((litter) => {
              const [dog] = litter.puppies
              const parents = [litter.mother?.name, litter.father?.name].filter(Boolean).join(' × ')
              return (
                <li key={litter.key}>
                  <Link to={`/tier/${dog.id}`} className="chip">
                    <Avatar dog={dog} size={24} />
                    {displayName(dog)}
                    {parents && <span className="muted"> · {t('von {parents}', { parents })}</span>}
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
          canWrite={canWrite}
          request={matingRequest}
          onCreated={handleCreated}
          onDelete={canWrite ? handleDelete : undefined}
          onOpenPhoto={setPhoto}
        />
      )}

      <Lightbox src={photo} onClose={() => setPhoto(null)} />
    </div>
  )
}
