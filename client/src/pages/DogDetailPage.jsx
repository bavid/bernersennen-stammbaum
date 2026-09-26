import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import Icon from '../components/Icon.jsx'
import Avatar from '../components/Avatar.jsx'
import Modal from '../components/Modal.jsx'
import Lightbox from '../components/Lightbox.jsx'
import DogForm from '../components/DogForm.jsx'
import Timeline from '../components/Timeline.jsx'
import TimelineEntryForm from '../components/TimelineEntryForm.jsx'
import { useToast } from '../components/Toast.jsx'
import { buildTimeline, genitive, sexLabel, shortName } from '../lib/timeline.js'
import { ageText, formatDateLong } from '../lib/dates.js'
import { readSetting, writeSetting } from '../lib/storage.js'

const HIGHLIGHT_MS = 2600

function ParentLink({ parent, freitext }) {
  if (parent) {
    return (
      <Link to={`/hund/${parent.id}`} className="chip">
        <Avatar dog={parent} size={24} />
        {shortName(parent.name)}
      </Link>
    )
  }
  return <span className={freitext ? '' : 'muted'}>{freitext || 'unbekannt'}</span>
}

function DogHero({ dog, onEdit, onAddEntry, onOpenPhoto }) {
  const age = dog.geburtsdatum ? ageText(dog.geburtsdatum) : null
  return (
    <header className="dog-hero">
      <div className="dog-hero-photo">
        {dog.foto_url ? (
          <button type="button" onClick={() => onOpenPhoto(dog.foto_url)} aria-label="Porträt vergrößern">
            <img src={dog.foto_url} alt={dog.name} />
          </button>
        ) : (
          <Avatar dog={dog} size={220} className="dog-hero-fallback" />
        )}
      </div>

      <div className="dog-hero-body">
        <span className="eyebrow">
          {sexLabel(dog.geschlecht)} · {dog.familyName}
        </span>
        <h1>{shortName(dog.name)}</h1>
        {dog.name !== shortName(dog.name) && <p className="dog-hero-fullname">{dog.name}</p>}

        <dl className="facts">
          <div>
            <dt>Geboren</dt>
            <dd>
              {dog.geburtsdatum ? formatDateLong(dog.geburtsdatum) : <span className="muted">unbekannt</span>}
              {age && <span className="muted"> · {age}</span>}
            </dd>
          </div>
          {dog.farbe_markings && (
            <div>
              <dt>Farbe &amp; Abzeichen</dt>
              <dd>{dog.farbe_markings}</dd>
            </div>
          )}
          <div>
            <dt>Mutter</dt>
            <dd>
              <ParentLink parent={dog.mother} freitext={dog.mother_freitext} />
            </dd>
          </div>
          <div>
            <dt>Vater</dt>
            <dd>
              <ParentLink parent={dog.father} freitext={dog.father_freitext} />
            </dd>
          </div>
          {dog.children.length > 0 && (
            <div className="facts-wide">
              <dt>Nachwuchs</dt>
              <dd className="chip-list">
                {dog.children.map((child) => (
                  <Link key={child.id} to={`/hund/${child.id}`} className="chip">
                    <Avatar dog={child} size={24} />
                    {shortName(child.name)}
                  </Link>
                ))}
              </dd>
            </div>
          )}
        </dl>

        {dog.beschreibung && <p className="dog-hero-description">{dog.beschreibung}</p>}

        {dog.isOwn && (
          <div className="dog-hero-actions">
            <button type="button" className="btn btn-primary" onClick={onAddEntry}>
              <Icon name="plus" />
              Erinnerung hinzufügen
            </button>
            <button type="button" className="btn btn-ghost" onClick={onEdit}>
              <Icon name="edit" />
              Bearbeiten
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

export default function DogDetailPage({ family }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const [dog, setDog] = useState(null)
  const [entries, setEntries] = useState([])
  const [breedingEvents, setBreedingEvents] = useState([])
  const [allDogs, setAllDogs] = useState([])
  const [error, setError] = useState(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState(null)
  const [editingDog, setEditingDog] = useState(false)
  const [photo, setPhoto] = useState(null)
  const [highlightKey, setHighlightKey] = useState(null)
  const [newestFirst, setNewestFirst] = useState(() => readSetting('newestFirst', false))

  // isCurrent verhindert, dass eine verspätete Antwort (vorheriger Hund) die aktuelle Seite überschreibt.
  const load = useCallback(
    async (isCurrent = () => true) => {
      const [dogData, timelineData, breedingData, allDogsData] = await Promise.all([
        api.getDog(id),
        api.listTimeline(id),
        api.listBreedingEvents(),
        api.listAllDogs()
      ])
      if (!isCurrent()) return
      setDog(dogData)
      setEntries(timelineData)
      setBreedingEvents(breedingData)
      setAllDogs(allDogsData)
    },
    [id]
  )

  useEffect(() => {
    let current = true
    setDog(null)
    setError(null)
    setComposerOpen(false)
    load(() => current).catch((err) => current && setError(err.message))
    return () => {
      current = false
    }
  }, [load])

  // Nach dem Speichern zum Eintrag springen – dorthin, wo ihn das Datum einsortiert hat.
  useEffect(() => {
    if (!highlightKey) return undefined
    const frame = requestAnimationFrame(() => {
      document.getElementById(highlightKey)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    const timer = setTimeout(() => setHighlightKey(null), HIGHLIGHT_MS)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [highlightKey])

  const items = useMemo(
    () => (dog ? buildTimeline({ dog, entries, breedingEvents, children: dog.children, newestFirst }) : []),
    [dog, entries, breedingEvents, newestFirst]
  )

  if (error) {
    return (
      <div className="page">
        <div className="error-banner" role="alert">{error}</div>
        <Link to="/stammbaum" className="back-link">
          <Icon name="arrowLeft" /> Zum Stammbaum
        </Link>
      </div>
    )
  }
  if (!dog) return <div className="page page-loading" aria-busy="true" />

  async function handleCreateEntry(payload) {
    const entry = await api.createTimelineEntry({ ...payload, dogId: dog.id })
    setEntries((current) => [...current, entry])
    setComposerOpen(false)
    setHighlightKey(`entry-${entry.id}`)
    toast(`Eingeordnet am ${formatDateLong(entry.datum)}`)
  }

  async function handleUpdateEntry(payload) {
    const entry = await api.updateTimelineEntry(editingEntry.id, payload)
    setEntries((current) => current.map((e) => (e.id === entry.id ? entry : e)))
    setEditingEntry(null)
    setHighlightKey(`entry-${entry.id}`)
    toast('Eintrag aktualisiert')
  }

  async function handleDeleteEntry() {
    await api.deleteTimelineEntry(editingEntry.id)
    setEntries((current) => current.filter((e) => e.id !== editingEntry.id))
    setEditingEntry(null)
    toast('Eintrag gelöscht')
  }

  async function handleUpdateDog(payload) {
    await api.updateDog(dog.id, payload)
    setEditingDog(false)
    await load()
    toast('Stammdaten gespeichert')
  }

  async function handleDeleteDog() {
    await api.deleteDog(dog.id)
    toast(`${dog.name} wurde entfernt`)
    navigate('/stammbaum')
  }

  function toggleOrder() {
    setNewestFirst(!newestFirst)
    writeSetting('newestFirst', !newestFirst)
  }

  const firstName = shortName(dog.name)

  return (
    <div className="page">
      <Link to="/stammbaum" className="back-link">
        <Icon name="arrowLeft" /> Stammbaum
      </Link>

      <DogHero
        dog={dog}
        onEdit={() => setEditingDog(true)}
        onAddEntry={() => {
          setComposerOpen(true)
          requestAnimationFrame(() => document.getElementById('composer')?.scrollIntoView({ behavior: 'smooth' }))
        }}
        onOpenPhoto={setPhoto}
      />

      <section className="chronicle" aria-labelledby="chronicle-title">
        <div className="chronicle-head">
          <div>
            <span className="eyebrow">Chronik</span>
            <h2 id="chronicle-title">{genitive(firstName)} Geschichte</h2>
          </div>
          {items.length > 1 && (
            <button type="button" className="btn btn-ghost" onClick={toggleOrder}>
              <Icon name="sort" />
              {newestFirst ? 'Neueste zuerst' : 'Älteste zuerst'}
            </button>
          )}
        </div>

        {!dog.isOwn && (
          <p className="notice">
            {firstName} gehört zu „{dog.familyName}“. Die Chronik ist nur für dieses Rudel sichtbar.
          </p>
        )}

        {dog.isOwn && (
          <div id="composer" className={`composer ${composerOpen ? 'is-open' : ''}`}>
            {composerOpen ? (
              <>
                <h3 className="composer-title">Neue Erinnerung für {firstName}</h3>
                <TimelineEntryForm onSubmit={handleCreateEntry} onCancel={() => setComposerOpen(false)} />
              </>
            ) : (
              <button type="button" className="composer-trigger" onClick={() => setComposerOpen(true)}>
                <Avatar dog={dog} size={40} />
                <span>Was gibt’s Neues von {firstName}?</span>
                <Icon name="plus" />
              </button>
            )}
          </div>
        )}

        {items.length > 0 ? (
          <Timeline
            items={items}
            birthDate={dog.geburtsdatum}
            highlightKey={highlightKey}
            canEdit={dog.isOwn}
            onEdit={setEditingEntry}
            onOpenPhoto={setPhoto}
          />
        ) : (
          dog.isOwn && <p className="muted chronicle-empty">Noch keine Einträge – die erste Erinnerung wartet.</p>
        )}
      </section>

      <Modal open={Boolean(editingEntry)} title="Eintrag bearbeiten" onClose={() => setEditingEntry(null)}>
        {editingEntry && (
          <TimelineEntryForm
            entry={editingEntry}
            onSubmit={handleUpdateEntry}
            onDelete={handleDeleteEntry}
            onCancel={() => setEditingEntry(null)}
          />
        )}
      </Modal>

      <Modal open={editingDog} title={`${firstName} bearbeiten`} onClose={() => setEditingDog(false)}>
        <DogForm
          dog={dog}
          allDogs={allDogs}
          ownFamilyId={family.id}
          onSubmit={handleUpdateDog}
          onDelete={handleDeleteDog}
          onCancel={() => setEditingDog(false)}
        />
      </Modal>

      <Lightbox src={photo} onClose={() => setPhoto(null)} />
    </div>
  )
}
