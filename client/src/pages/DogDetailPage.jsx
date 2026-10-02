import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import Icon from '../components/Icon.jsx'
import Avatar from '../components/Avatar.jsx'
import Modal from '../components/Modal.jsx'
import Lightbox from '../components/Lightbox.jsx'
import DogForm from '../components/DogForm.jsx'
import Housemates from '../components/Housemates.jsx'
import SharePanel from '../components/SharePanel.jsx'
import ShelterSharePanel from '../components/ShelterSharePanel.jsx'
import SteckbriefPanel from '../components/SteckbriefPanel.jsx'
import VermittlungStatusPanel from '../components/VermittlungStatusPanel.jsx'
import HandoverDialog from '../components/HandoverDialog.jsx'
import TakeOverPanel from '../components/TakeOverPanel.jsx'
import ExpandableText from '../components/ExpandableText.jsx'
import Timeline from '../components/Timeline.jsx'
import TimelineEntryForm from '../components/TimelineEntryForm.jsx'
import { useToast } from '../components/Toast.jsx'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import { hasRole } from '../lib/roles.js'
import { isVisit } from '../lib/visits.js'
import { buildTimeline, displayName, dogLabel, genitive, livesWithLabel, sexLabel, shortName, speciesLabel } from '../lib/timeline.js'
import { companionLine } from '../lib/companions.js'
import { ageText, formatDateLong } from '../lib/dates.js'
import { readSetting, writeSetting } from '../lib/storage.js'

const HIGHLIGHT_MS = 2600

// parent.id fehlt (null), wenn der Elternteil hier nicht sichtbar ist (fremder, nicht geteilter
// Bereich) – der Server liefert dann trotzdem den Namen zur Anzeige, aber ohne Ziel-Id. Ein Link auf
// `/tier/null` wäre kaputt, darum bleibt es in dem Fall bei einem einfachen Chip ohne Link.
export function ParentLink({ parent, freitext }) {
  if (parent?.id) {
    return (
      <Link to={`/tier/${parent.id}`} className="chip">
        <Avatar dog={parent} size={24} />
        {dogLabel(parent)}
      </Link>
    )
  }
  if (parent) {
    return (
      <span className="chip">
        <Avatar dog={parent} size={24} />
        {dogLabel(parent)}
      </span>
    )
  }
  return <span className={freitext ? '' : 'muted'}>{freitext || 'unbekannt'}</span>
}

// "lebt mit Hermes" – für Tiere ohne eigene Abstammung, die mit jemandem zusammenleben
function housemateLine(dog) {
  const hasPedigree = dog.mother_dog_id || dog.father_dog_id || dog.mother_freitext || dog.father_freitext || dog.children.length
  if (hasPedigree || !dog.housemates.length) return null
  return livesWithLabel(dog.housemates)
}

// canWrite (Phase R): dog.isOwn UND die Rolle darf schreiben - ein Gast in einer Familie sieht deren Tiere
// ohne Bearbeiten/Erinnerung/Mitbewohner-Knöpfe.
function DogHero({ dog, allDogs, canWrite, onEdit, onAddEntry, onOpenPhoto, onAddHousemate, onCreateHousemate, onRemoveHousemate }) {
  const livesWith = housemateLine(dog)
  const age = dog.geburtsdatum ? ageText(dog.geburtsdatum) : null
  // Für geteilte Tiere im fremden Bereich (!dog.canEdit) ersetzt der Name des besitzenden Bereichs
  // "Bei euch" durch "Im {familyName}" – der Abschieds-/Erinnerungstext bleibt unverändert.
  const companion = companionLine(dog, !dog.canEdit ? { ownerName: dog.familyName } : undefined)
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
        {companion && (
          <p className={`dog-hero-companion ${companion.memorial ? 'is-memorial' : ''}`}>
            {companion.memorial && <Icon name="heart" />} {companion.text}
          </p>
        )}
        {livesWith && (
          <p className="dog-hero-housemate">
            <Icon name="heart" /> {livesWith}
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
            canEdit={canWrite}
            onAdd={onAddHousemate}
            onCreated={onCreateHousemate}
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

        {dog.beschreibung && <ExpandableText text={dog.beschreibung} className="dog-hero-description" lines={4} />}

        {canWrite && (
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

export default function DogDetailPage({ family, onFamilyChange }) {
  const { words } = useTheme()
  const { id } = useParams()
  const navigate = useNavigate()
  const { hash } = useLocation()
  const toast = useToast()
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()

  const [dog, setDog] = useState(null)
  const [entries, setEntries] = useState([])
  const [breedingEvents, setBreedingEvents] = useState([])
  const [allDogs, setAllDogs] = useState([])
  const [error, setError] = useState(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState(null)
  const [editingDog, setEditingDog] = useState(false)
  const [photo, setPhoto] = useState(null)
  const [handoverOpen, setHandoverOpen] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
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
    () => (dog ? buildTimeline({ dog, entries, breedingEvents, children: dog.children, newestFirst, matingLabel: words.mating }) : []),
    [dog, entries, breedingEvents, newestFirst, words.mating]
  )

  if (error) {
    return (
      <div className="page">
        <div className="error-banner" role="alert">{error}</div>
        <Link to="/stammbaum" className="back-link">
          <Icon name="arrowLeft" /> {words.toTree}
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

  // Rollen (Phase R, lib/roles.js): in einer Familie schreibt ab Mitglied, löscht Tiere ab Stellvertretung -
  // außerhalb (Zuhause, Tierheim) ist man immer Leitung, dort ändert sich nichts.
  const inGroup = family.art === 'rudel'
  const visiting = isVisit(family)
  const canWrite = dog.isOwn && hasRole(family, 'mitglied')
  const canDeleteDog = !inGroup || hasRole(family, 'stellvertretung')
  // Tier der Familie in die eigene Chronik übernehmen: GET /dogs liefert kannUebernehmen, die Detailansicht
  // (noch) nicht - dann dieselbe Regel wie server/routes/dogs.js canTakeOverInArea: Leitungs-Mitglied mit
  // eigenem Zuhause (nicht der gemeinsame Schlüssel), Tier gehört der Familie.
  const canTakeOver =
    dog.kannUebernehmen ??
    (inGroup && dog.canEdit && family.home?.art === 'zuhause' && family.home.id !== family.id && hasRole(family, 'leitung'))

  // Löschen-Knopf nur für Kommentare, die der Server auch löschen ließe. In einer Familie (lib/authorship.js):
  // die eigenen (vonMir) oder ab Stellvertretung (Moderation). Sonst wie bisher: eigene (aktiver Bereich)
  // oder auf einem Eintrag, den der aktive Bereich besitzt (dog.canEdit).
  // Zu Besuch (Phase V2) nur die eigenen Kommentare.
  function canDeleteComment(_entry, comment) {
    if (visiting) return Boolean(comment.vonMir)
    if (inGroup) return Boolean(comment.vonMir) || hasRole(family, 'stellvertretung')
    return comment.family_id === family.id || dog.canEdit
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

  // QuickAnimalForm hat das Tier bereits angelegt und verlinkt (livesWith=dog) – hier nur neu laden
  async function handleCreateHousemate(created) {
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

  // Vermittlungsstatus ändern (Tierheim): VermittlungStatusPanel ruft die API selbst auf (Speichern-
  // Knopf, ggf. mit Bestätigung) und liefert nur die rohe Hund-Zeile zurück - wie handleAddHousemate
  // oben wird sie in den bestehenden (angereicherten) dog-State gemischt statt ihn zu ersetzen.
  function handleVermittlungStatusChange(updated) {
    setDog((current) => ({ ...current, ...updated }))
  }

  // SteckbriefPanel liefert ebenfalls nur die rohe Hund-Zeile (public_slug geändert) - gleiches Mischen.
  function handleSteckbriefChange(updated) {
    setDog((current) => ({ ...current, ...updated }))
  }

  // ShelterSharePanel liefert nur die neue shelterShare-Antwort (nicht den ganzen Hund) - hier gezielt
  // unter dog.shelterShare einsortiert, wie handleSteckbriefChange oben für public_slug.
  function handleShelterShareChange(shelterShare) {
    setDog((current) => ({ ...current, shelterShare }))
  }

  // Der Übergabe-Gutschein setzt serverseitig vermittlung_status auf "reserviert" - hier nur die
  // Anzeige nachziehen, der Dialog selbst zeigt Code und Link.
  function handleHandoverCreated() {
    setDog((current) => ({ ...current, vermittlung_status: 'reserviert' }))
  }

  // Übergabe zurückziehen (Task 6): DELETE /api/dogs/:id/handover zieht offene Übergabe-Gutscheine
  // zurück und setzt den Status wieder auf "in Vermittlung" - Antwort ist die rohe Hund-Zeile, wie bei
  // handleVermittlungStatusChange oben also in den bestehenden dog-State gemischt statt ihn zu ersetzen.
  async function handleWithdrawHandover() {
    setWithdrawing(true)
    try {
      const updated = await api.withdrawHandover(dog.id)
      setDog((current) => ({ ...current, ...updated }))
      toast(`Übergabe zurückgezogen – ${displayName(dog)} ist wieder in Vermittlung.`)
    } catch (err) {
      toast(err.message)
    } finally {
      setWithdrawing(false)
    }
  }

  async function handleDeleteDog() {
    await api.deleteDog(dog.id)
    toast(`${dog.name} wurde entfernt`)
    navigate('/stammbaum')
  }

  // Ein hierher geteiltes Tier des eigenen Haushalts bearbeiten: zurück zu "Meine Chronik" wechseln
  // und zur selben Tierseite navigieren. Kein manuelles load() nötig – App.jsx hängt den Seiteninhalt
  // an family.id auf (key), der Bereichswechsel remountet diese Seite also von selbst und lädt neu
  // (canEdit wechselt serverseitig mit dem aktiven Bereich).
  async function handleSwitchToHome() {
    try {
      const me = await api.view(family.home.id)
      onFamilyChange?.(me)
      navigate(`/tier/${dog.id}`)
    } catch (err) {
      toast(err.message)
    }
  }

  function toggleOrder() {
    setNewestFirst(!newestFirst)
    writeSetting('newestFirst', !newestFirst)
  }

  const firstName = displayName(dog)
  const about = dog.name_unbekannt ? words.thisAnimalDat : firstName

  return (
    <div className="page">
      <Link to="/stammbaum" className="back-link">
        <Icon name="arrowLeft" /> {words.treeLabel}
      </Link>

      <DogHero
        dog={dog}
        allDogs={allDogs}
        canWrite={canWrite}
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

      {/* Die key-Werte setzen den Zustand der Panels bei einem anderen Tier zurück - und müssen unter diesen
          Geschwistern eindeutig sein: zweimal key={dog.id} ließ React bei jedem Neu-Rendern der Seite eine
          weitere Kopie von "In Familien zeigen" im DOM zurück (V-Fehler 1, Demo-Nele ~20× untereinander). */}
      {canTakeOver && <TakeOverPanel key={`take-over-${dog.id}`} dog={dog} onTakenOver={load} />}

      {dog.canEdit && family.art === 'zuhause' && (
        <SharePanel key={`share-${dog.id}`} dog={dog} family={family} onFamilyChange={onFamilyChange} />
      )}

      {dog.canEdit && family.art === 'zuhause' && dog.shelterShare && (
        <ShelterSharePanel key={`shelter-share-${dog.id}`} dog={dog} onChange={handleShelterShareChange} />
      )}

      {dog.canEdit && family.art === 'tierheim' && (
        <section className="shelter-panel" aria-labelledby="shelter-panel-title">
          <h2 id="shelter-panel-title">Vermittlung</h2>
          <VermittlungStatusPanel key={dog.id} dog={dog} onChange={handleVermittlungStatusChange} />

          <SteckbriefPanel dog={dog} onDogChange={handleSteckbriefChange} />

          <div className="steckbrief-actions">
            {/* Phase P: ein pausiertes Tier ist gerade nicht vermittelbar - der Server lehnt eine Übergabe
                ab (routes/dogs.js POST /:id/handover), der Knopf deshalb gleich gesperrt, mit Hinweis. */}
            <button
              type="button"
              className="btn btn-ghost"
              disabled={dog.vermittlung_status === 'pausiert'}
              aria-describedby={dog.vermittlung_status === 'pausiert' ? 'handover-paused-hint' : undefined}
              onClick={() => setHandoverOpen(true)}
            >
              <Icon name="logout" />
              Vermittelt – Übergabe vorbereiten
            </button>
            {dog.vermittlung_status === 'pausiert' && (
              <p className="field-hint" id="handover-paused-hint">
                Erst auf ‚Verfügbar‘ oder ‚Reserviert‘ setzen.
              </p>
            )}
            {dog.vermittlung_status === 'reserviert' && (
              <button type="button" className="btn btn-ghost" disabled={withdrawing || isDemo} onClick={handleWithdrawHandover}>
                <Icon name="close" />
                {withdrawing ? 'Ziehe zurück …' : 'Übergabe zurückziehen'}
              </button>
            )}
            {isDemo && dog.vermittlung_status === 'reserviert' && <p className="field-hint">{readOnlyHint}</p>}
          </div>
        </section>
      )}

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

        {!dog.canEdit && visiting && (
          <div className="notice">
            <p>Du bist zu Besuch bei „{dog.familyName}“ – ansehen und kommentieren geht, ändern nicht.</p>
          </div>
        )}

        {!dog.canEdit && !visiting && (
          <div className="notice notice-with-action">
            <p>Lebt im Zuhause „{dog.familyName}“ und wird hier geteilt.</p>
            {dog.ownerFamilyId === family.home?.id && (
              <button type="button" className="btn btn-ghost" onClick={handleSwitchToHome}>
                In Meiner Chronik bearbeiten
              </button>
            )}
          </div>
        )}

        {canWrite && (
          <div id="composer" className={`composer ${composerOpen ? 'is-open' : ''}`}>
            {composerOpen ? (
              <>
                <h3 className="composer-title">Neue Erinnerung zu {about}</h3>
                <TimelineEntryForm
                  isHousehold={family.art === 'zuhause'}
                  isShelter={family.art === 'tierheim'}
                  onSubmit={handleCreateEntry}
                  onCancel={() => setComposerOpen(false)}
                />
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
            canEdit={canWrite}
            onEdit={setEditingEntry}
            onOpenPhoto={setPhoto}
            onAddComment={handleAddComment}
            onDeleteComment={handleDeleteComment}
            canDeleteComment={canDeleteComment}
          />
        ) : (
          canWrite && <p className="muted chronicle-empty">Noch keine Einträge – die erste Erinnerung wartet.</p>
        )}
      </section>

      <Modal open={Boolean(editingEntry)} title="Eintrag bearbeiten" onClose={() => setEditingEntry(null)}>
        {editingEntry && (
          <TimelineEntryForm
            entry={editingEntry}
            isHousehold={family.art === 'zuhause'}
            isShelter={family.art === 'tierheim'}
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
          onDelete={canDeleteDog ? handleDeleteDog : undefined}
          onCancel={() => setEditingDog(false)}
        />
      </Modal>

      <Modal open={handoverOpen} title={`Übergabe vorbereiten – ${firstName}`} onClose={() => setHandoverOpen(false)}>
        {handoverOpen && <HandoverDialog dog={dog} onCreated={handleHandoverCreated} />}
      </Modal>

      <Lightbox src={photo} onClose={() => setPhoto(null)} />
    </div>
  )
}
