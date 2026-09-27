import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import Icon from '../components/Icon.jsx'
import Avatar from '../components/Avatar.jsx'
import Modal from '../components/Modal.jsx'
import Lightbox from '../components/Lightbox.jsx'
import DogForm from '../components/DogForm.jsx'
import Housemates from '../components/Housemates.jsx'
import Timeline from '../components/Timeline.jsx'
import TimelineEntryForm from '../components/TimelineEntryForm.jsx'
import { useToast } from '../components/Toast.jsx'
import { adoptiveTitle, buildTimeline, displayName, dogLabel, genitive, sexLabel, shortName, speciesLabel } from '../lib/timeline.js'
import { ageText, formatDateLong } from '../lib/dates.js'
import { readSetting, writeSetting } from '../lib/storage.js'

const HIGHLIGHT_MS = 2600

function ParentLink({ parent, freitext }) {
  if (parent) {
    return (
      <Link to={`/tier/${parent.id}`} className="chip">
        <Avatar dog={parent} size={24} />
        {dogLabel(parent)}
      </Link>
    )
  }
  return <span className={freitext ? '' : 'muted'}>{freitext || 'unbekannt'}</span>
}

// "Adoptiv-Bruder von Hermes" – für Tiere ohne eigene Abstammung, die mit jemandem zusammenleben
function adoptiveLine(dog) {
  const hasPedigree = dog.mother_dog_id || dog.father_dog_id || dog.mother_freitext || dog.father_freitext || dog.children.length
  if (hasPedigree || !dog.housemates.length) return null
  return `${adoptiveTitle(dog)} von ${dog.housemates.map(displayName).join(' & ')}`
}

function DogHero({ dog, allDogs, onEdit, onAddEntry, onOpenPhoto, onAddHousemate, onCreateHousemate, onRemoveHousemate }) {
  const adoptive = adoptiveLine(dog)
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
          {dog.tierart === 'anderes' ? `${speciesLabel(dog.tierart)} · ` : ''}
          {sexLabel(dog.geschlecht, dog.tierart)} · {dog.familyName}
        </span>
        <h1 className={dog.name_unbekannt ? 'is-unknown' : undefined}>{displayName(dog)}</h1>
        {!dog.name_unbekannt && dog.name !== shortName(dog.name) && <p className="dog-hero-fullname">{dog.name}</p>}
        {adoptive && (
          <p className="dog-hero-adoptive">
            <Icon name="heart" /> {adoptive}
          </p>
        )}

        <dl className="facts">
          <div className="facts-wide">
            <dt>Rasse</dt>
            <dd>{dog.rasse || <span className="muted">nicht angegeben</span>}</dd>
          </div>
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
          <Housemates
            dog={dog}
            allDogs={allDogs}
            canEdit={dog.isOwn}
            onAdd={onAddHousemate}
            onCreate={onCreateHousemate}
            onRemove={onRemoveHousemate}
          />
          {dog.children.length > 0 && (
            <div className="facts-wide">
              <dt>Nachwuchs</dt>
              <dd className="chip-list">
                {dog.children.map((child) => (
                  <Link key={child.id} to={`/tier/${child.id}`} className="chip">
                    <Avatar dog={child} size={24} />
                    {dogLabel(child)}
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
  const { hash } = useLocation()
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

  // Aus "Neu im Rudel" verlinkt (#entry-12): einmalig direkt zum Eintrag springen
  const handledHash = useRef(null)
  useEffect(() => {
    if (!dog || !hash.startsWith('#entry-') || handledHash.current === hash) return
    handledHash.current = hash
    setHighlightKey(hash.slice(1))
  }, [dog, hash])

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

  // Kommentare: Fehler beim Schreiben zeigt das Formular selbst an
  async function handleAddComment(entry, payload) {
    const comment = await api.addComment(entry.id, payload)
    setEntries((current) =>
      current.map((e) => (e.id === entry.id ? { ...e, comments: [...(e.comments || []), comment] } : e))
    )
  }

  async function handleDeleteComment(entry, comment) {
    try {
      await api.deleteComment(entry.id, comment.id)
      setEntries((current) =>
        current.map((e) => (e.id === entry.id ? { ...e, comments: e.comments.filter((c) => c.id !== comment.id) } : e))
      )
    } catch (err) {
      toast(err.message)
    }
  }

  async function handleAddHousemate(otherId) {
    try {
      const housemates = await api.addHousemate(dog.id, otherId)
      setDog((current) => ({ ...current, housemates }))
      toast('Verbindung „lebt zusammen“ hinzugefügt')
    } catch (err) {
      toast(err.message)
    }
  }

  // Schnellerfassung: Fehler landen im Formular, deshalb hier kein try/catch
  async function handleCreateHousemate(payload) {
    const created = await api.createDog({ ...payload, housemateId: dog.id })
    await load()
    toast(`${displayName(created)} lebt jetzt mit ${displayName(dog)} zusammen`)
  }

  async function handleRemoveHousemate(mate) {
    try {
      await api.removeHousemate(dog.id, mate.id)
      setDog((current) => ({ ...current, housemates: current.housemates.filter((h) => h.id !== mate.id) }))
      toast(`Verbindung zu ${dogLabel(mate)} entfernt`)
    } catch (err) {
      toast(err.message)
    }
  }

  async function handleUpdateDog({ housemateId, ...payload }) {
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

  const firstName = displayName(dog)
  const about = dog.name_unbekannt ? 'diesem Hund' : firstName

  return (
    <div className="page">
      <Link to="/stammbaum" className="back-link">
        <Icon name="arrowLeft" /> Stammbaum
      </Link>

      <DogHero
        dog={dog}
        allDogs={allDogs}
        onAddHousemate={handleAddHousemate}
        onCreateHousemate={handleCreateHousemate}
        onRemoveHousemate={handleRemoveHousemate}
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
            <h2 id="chronicle-title">{dog.name_unbekannt ? 'Geschichte' : `${genitive(firstName)} Geschichte`}</h2>
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
                <h3 className="composer-title">Neue Erinnerung zu {about}</h3>
                <TimelineEntryForm onSubmit={handleCreateEntry} onCancel={() => setComposerOpen(false)} />
              </>
            ) : (
              <button type="button" className="composer-trigger" onClick={() => setComposerOpen(true)}>
                <Avatar dog={dog} size={40} />
                <span>Was gibt’s Neues von {about}?</span>
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
            onAddComment={dog.isOwn ? handleAddComment : undefined}
            onDeleteComment={handleDeleteComment}
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
