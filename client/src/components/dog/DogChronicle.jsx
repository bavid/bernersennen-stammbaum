import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../../api'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import Icon from '../Icon.jsx'
import Avatar from '../Avatar.jsx'
import Modal from '../Modal.jsx'
import Timeline from '../Timeline.jsx'
import TimelineEntryForm from '../TimelineEntryForm.jsx'
import { useToast } from '../Toast.jsx'
import useMirrorActions from '../erlebtMit/useMirrorActions.js'
import { hasRole } from '../../lib/roles.js'
import { isOwnHome, isVisit } from '../../lib/visits.js'
import { buildTimeline, displayName, genitive } from '../../lib/timeline.js'
import { formatDateLong } from '../../lib/dates.js'
import { readSetting, writeSetting } from '../../lib/storage.js'
import { RECENT_ITEMS, recentItems } from '../../lib/dogProfile.js'

const HIGHLIGHT_MS = 2600
export const COMPOSER_ID = 'composer'

// Löschen-Knopf nur für Kommentare, die der Server auch löschen ließe. In einer Familie (lib/authorship.js): die eigenen
// (vonMir) oder ab Stellvertretung (Moderation). Zu Besuch (Phase V2) nur die eigenen. Sonst: eigene (aktiver Bereich)
// oder auf einem Eintrag, den der aktive Bereich besitzt (dog.canEdit).
function commentDeleteRule(family, dog) {
  const visiting = isVisit(family)
  const inGroup = family.art === 'rudel'
  return (_entry, comment) => {
    if (visiting) return Boolean(comment.vonMir)
    if (inGroup) return Boolean(comment.vonMir) || hasRole(family, 'stellvertretung')
    return comment.family_id === family.id || dog.canEdit
  }
}

// Ein hierher geteiltes Tier: wem es gehört - und, ist es das eigene, der Weg zum Bearbeiten in "Mein Zuhause" (das Gate
// der Tierseite wechselt über ?in=home genau einmal dorthin). Zu Besuch kein Hinweis (der Chip im Kopf sagt es).
function SharedNotice({ dog, family }) {
  if (dog.canEdit || isVisit(family)) return null
  return (
    <div className="notice notice-with-action">
      <p>Lebt im Zuhause „{dog.familyName}“ und wird hier geteilt.</p>
      {dog.ownerFamilyId === family.home?.id && (
        <Link to={`/tier/${dog.id}?in=home`} className="btn btn-ghost">
          In „Mein Zuhause“ bearbeiten
        </Link>
      )}
    </div>
  )
}

// Reiter "Chronik" der Tierseite (Phase W, Schritt 2): Erzählen (Composer), Reihenfolge, die Zeitleiste mit Kommentaren und
// gespiegelten "Mit dabei"-Beiträgen. Aus "Neuigkeiten" verlinkt (#entry-12) springt sie einmal zum Beitrag; nach dem
// Speichern dorthin, wo ihn das Datum einsortiert hat. composerOpen/onComposerChange steuert die Seite (Kopf "Erzählen",
// ?neu=1).
export default function DogChronicle({ dog, family, entries, setEntries, breedingEvents, canWrite, composerOpen, onComposerChange, onOpenPhoto }) {
  const { words } = useTheme()
  const toast = useToast()
  const { hash } = useLocation()
  const [editingEntry, setEditingEntry] = useState(null)
  const [highlightKey, setHighlightKey] = useState(null)
  const [newestFirst, setNewestFirst] = useState(() => readSetting('newestFirst', false))
  const [showAll, setShowAll] = useState(false)
  const firstName = displayName(dog)
  const about = dog.name_unbekannt ? words.thisAnimalDat : firstName

  const handledHash = useRef(null)
  useEffect(() => {
    if (!hash.startsWith('#entry-') || handledHash.current === hash) return
    handledHash.current = hash
    setHighlightKey(hash.slice(1))
  }, [hash])

  useEffect(() => {
    if (!highlightKey) return undefined
    const frame = requestAnimationFrame(() => {
      document.getElementById(highlightKey)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    })
    const timer = setTimeout(() => setHighlightKey(null), HIGHLIGHT_MS)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [highlightKey])

  const mirror = useMirrorActions({
    family,
    dog,
    onRemoved: (item) => setEntries((current) => current.filter((e) => !(e.gespiegelt && e.id === item.id)))
  })

  const items = useMemo(
    () => buildTimeline({ dog, entries, breedingEvents, children: dog.children, newestFirst, matingLabel: words.mating }),
    [dog, entries, breedingEvents, newestFirst, words.mating]
  )
  const recent = recentItems(items, { newestFirst, showAll, keepKey: highlightKey })
  // Ein Ziel im verborgenen Teil (#entry-N, ein alter Beitrag gerade gespeichert) klappt die Chronik dauerhaft auf.
  useEffect(() => {
    if (highlightKey && recent.hidden === 0 && !showAll && items.length > RECENT_ITEMS) setShowAll(true)
  }, [highlightKey, recent.hidden, showAll, items.length])
  const earlier = recent.hidden > 0 && (
    <button type="button" className="btn btn-ghost dog-chronicle-more" onClick={() => setShowAll(true)}>
      {newestFirst ? `Ältere ${words.entries} anzeigen` : `Frühere ${words.entries} anzeigen`} ({recent.hidden})
    </button>
  )

  async function handleCreate(payload) {
    const entry = await api.createTimelineEntry({ ...payload, dogId: dog.id })
    setEntries((current) => [...current, entry])
    onComposerChange(false)
    setHighlightKey(`entry-${entry.id}`)
    toast(`Eingeordnet am ${formatDateLong(entry.datum)}`)
  }

  async function handleUpdate(payload) {
    const entry = await api.updateTimelineEntry(editingEntry.id, payload)
    setEntries((current) => current.map((e) => (e.id === entry.id ? entry : e)))
    setEditingEntry(null)
    setHighlightKey(`entry-${entry.id}`)
    toast(`${words.entry} aktualisiert`)
  }

  async function handleDelete() {
    await api.deleteTimelineEntry(editingEntry.id)
    setEntries((current) => current.filter((e) => e.id !== editingEntry.id))
    setEditingEntry(null)
    toast(`${words.entry} gelöscht`)
  }

  // Kommentare: Fehler beim Schreiben zeigt das Formular selbst an
  async function handleAddComment(entry, payload) {
    const comment = await api.addComment(entry.id, payload)
    setEntries((current) => current.map((e) => (e.id === entry.id ? { ...e, comments: [...(e.comments || []), comment] } : e)))
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

  function toggleOrder() {
    setNewestFirst(!newestFirst)
    writeSetting('newestFirst', !newestFirst)
  }

  const formProps = { canTag: isOwnHome(family), isHousehold: family.art === 'zuhause', isShelter: family.art === 'tierheim' }

  return (
    <section className="chronicle dog-chronicle" aria-labelledby="chronicle-title">
      <div className="chronicle-head">
        <h2 id="chronicle-title">{dog.name_unbekannt ? 'Geschichte' : `${genitive(firstName)} Geschichte`}</h2>
        {items.length > 1 && (
          <button type="button" className="btn btn-ghost" onClick={toggleOrder}>
            <Icon name="sort" />
            {newestFirst ? 'Neueste zuerst' : 'Älteste zuerst'}
          </button>
        )}
      </div>

      <SharedNotice dog={dog} family={family} />

      {canWrite && (
        <div id={COMPOSER_ID} className={`composer ${composerOpen ? 'is-open' : ''}`}>
          {composerOpen ? (
            <>
              <h3 className="composer-title">
                {words.newEntry} zu {about}
              </h3>
              <TimelineEntryForm {...formProps} onSubmit={handleCreate} onCancel={() => onComposerChange(false)} />
            </>
          ) : (
            <button type="button" className="composer-trigger" onClick={() => onComposerChange(true)}>
              <Avatar dog={dog} size={40} />
              <span>Was gibt’s Neues von {about}?</span>
              <Icon name="plus" />
            </button>
          )}
        </div>
      )}

      {!newestFirst && earlier}
      {items.length > 0 ? (
        <Timeline
          items={recent.shown}
          birthDate={dog.geburtsdatum}
          highlightKey={highlightKey}
          canEdit={canWrite}
          onEdit={setEditingEntry}
          onOpenPhoto={onOpenPhoto}
          onAddComment={handleAddComment}
          onDeleteComment={handleDeleteComment}
          canDeleteComment={commentDeleteRule(family, dog)}
          mirror={mirror}
        />
      ) : (
        canWrite && <p className="muted chronicle-empty">{words.entriesEmpty}</p>
      )}
      {newestFirst && earlier}

      <Modal open={Boolean(editingEntry)} title={`${words.entry} bearbeiten`} onClose={() => setEditingEntry(null)}>
        {editingEntry && (
          <TimelineEntryForm
            {...formProps}
            entry={editingEntry}
            onSubmit={handleUpdate}
            onDelete={handleDelete}
            onCancel={() => setEditingEntry(null)}
          />
        )}
      </Modal>
    </section>
  )
}
