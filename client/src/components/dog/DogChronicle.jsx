import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../../api'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import Icon from '../Icon.jsx'
import Avatar from '../Avatar.jsx'
import Modal from '../Modal.jsx'
import Timeline from '../Timeline.jsx'
import TimelineEntryForm from '../TimelineEntryForm.jsx'
import GrussKarteDialog from '../grusskarte/GrussKarteDialog.jsx'
import { useToast } from '../Toast.jsx'
import useMirrorActions from '../erlebtMit/useMirrorActions.js'
import { hasRole } from '../../lib/roles.js'
import { isOwnHome, isVisit } from '../../lib/visits.js'
import { buildTimeline, displayName, genitive } from '../../lib/timeline.js'
import { formatDateLong } from '../../lib/dates.js'
import { readSetting, writeSetting } from '../../lib/storage.js'
import { RECENT_ITEMS, recentItems, visibleInNames } from '../../lib/dogProfile.js'
import { t } from '../../lib/i18n/index.js'
import { Button } from '../ui'
import { IMPORT_TEXT } from '../../lib/fotoImport/texts.js'
import { canMakeBook, fotobuchRoute } from '../../lib/fotobuch.js'

// „Fotos mitbringen“ (Plan 2027) als eigener Chunk - fflate und der EXIF-Leser kommen erst beim Öffnen.
const FotoImportDialog = lazy(() => import('../fotoImport/FotoImportDialog.jsx'))

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

// Das eigene, hierher geteilte Tier: der Weg zum Bearbeiten in "Mein Zuhause" (das Gate der Tierseite wechselt über ?in=home
// genau einmal dorthin). Bei fremden Tieren sagt der Kopf, wo sie leben (lib/dogProfile.js originLine), zu Besuch der Chip.
function SharedNotice({ dog, family }) {
  if (dog.canEdit || isVisit(family) || dog.ownerFamilyId !== family.home?.id) return null
  return (
    <div className="notice notice-with-action">
      <p>{t('Lebt im Zuhause „{home}“ und wird hier geteilt.', { home: dog.familyName })}</p>
      <Button to={`/tier/${dog.id}?in=home`} as={Link} variant="ghost">
        {t('In „Mein Zuhause“ bearbeiten')}
      </Button>
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
  const { hash, state } = useLocation()
  const [editingEntry, setEditingEntry] = useState(null)
  const [sharingEntry, setSharingEntry] = useState(null)
  const [highlightKey, setHighlightKey] = useState(null)
  const [newestFirst, setNewestFirst] = useState(() => readSetting('newestFirst', false))
  const [showAll, setShowAll] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
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
  // Gerade angelegt (hooks/useAnimalCreate.js, state.neuesTier) und noch ohne Erinnerung: ein freundlicher Anstoß zur ersten.
  const firstOne = Boolean(state?.neuesTier) && entries.length === 0
  // Ein Ziel im verborgenen Teil (#entry-N, ein alter Beitrag gerade gespeichert) klappt die Chronik dauerhaft auf.
  useEffect(() => {
    if (highlightKey && recent.hidden === 0 && !showAll && items.length > RECENT_ITEMS + 1) setShowAll(true)
  }, [highlightKey, recent.hidden, showAll, items.length])
  // Der Knopf verschwindet mit dem Aufklappen - der Fokus geht an die Überschrift der Chronik, nicht auf <body>.
  const titleRef = useRef(null)
  const focusTitle = useRef(false)
  useEffect(() => {
    if (!showAll || !focusTitle.current) return
    focusTitle.current = false
    titleRef.current?.focus()
  }, [showAll])
  function expand() {
    focusTitle.current = true
    setShowAll(true)
  }
  const earlier = recent.hidden > 0 && (
    <Button type="button" variant="ghost" className="dog-chronicle-more" onClick={expand}>
      {newestFirst ? t('Ältere {entries} anzeigen', { entries: words.entries }) : t('Frühere {entries} anzeigen', { entries: words.entries })} ({recent.hidden})
    </Button>
  )

  async function handleCreate(payload) {
    const entry = await api.createTimelineEntry({ ...payload, dogId: dog.id })
    setEntries((current) => [...current, entry])
    onComposerChange(false)
    setHighlightKey(`entry-${entry.id}`)
    toast(t('Eingeordnet am {date}', { date: formatDateLong(entry.datum) }))
  }

  async function handleUpdate(payload) {
    const entry = await api.updateTimelineEntry(editingEntry.id, payload)
    setEntries((current) => current.map((e) => (e.id === entry.id ? entry : e)))
    setEditingEntry(null)
    setHighlightKey(`entry-${entry.id}`)
    toast(t('{entry} aktualisiert', { entry: words.entry }))
  }

  async function handleDelete() {
    await api.deleteTimelineEntry(editingEntry.id)
    setEntries((current) => current.filter((e) => e.id !== editingEntry.id))
    setEditingEntry(null)
    toast(t('{entry} gelöscht', { entry: words.entry }))
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

  const formProps = {
    canTag: isOwnHome(family),
    isHousehold: family.art === 'zuhause',
    isShelter: family.art === 'tierheim',
    shareNames: visibleInNames(dog, family.memberships)
  }

  return (
    <section className="chronicle dog-chronicle" aria-labelledby="chronicle-title">
      <div className="chronicle-head">
        <h2 id="chronicle-title" ref={titleRef} tabIndex={-1}>
          {dog.name_unbekannt ? t('Geschichte') : t('{nameGen} Geschichte', { nameGen: genitive(firstName), name: firstName })}
        </h2>
        <div className="chronicle-actions">
          {items.length > 1 && (
            <Button type="button" variant="ghost" onClick={toggleOrder}>
              <Icon name="sort" />
              {newestFirst ? t('Neueste zuerst') : t('Älteste zuerst')}
            </Button>
          )}
          {/* Chronik als Fotobuch (Plan 2027): nur mit sichtbaren Erinnerungen - das Buch zeigt nur, was hier zu sehen ist. */}
          {canMakeBook(entries) && (
            <Button to={fotobuchRoute(dog.id)} as={Link} variant="ghost">
              <Icon name="book" />
              {t('Als Fotobuch drucken')}
            </Button>
          )}
        </div>
      </div>

      <SharedNotice dog={dog} family={family} />

      {canWrite && (
        <div id={COMPOSER_ID} className={`composer ${composerOpen ? 'is-open' : ''}`}>
          {composerOpen ? (
            <>
              <h3 className="composer-title">
                {t('{newEntry} zu {about}', { newEntry: words.newEntry, about })}
              </h3>
              <TimelineEntryForm {...formProps} draftKey={`tier-${dog.id}`} onSubmit={handleCreate} onCancel={() => onComposerChange(false)} />
            </>
          ) : (
            <>
              {firstOne && <p className="chronicle-first hand">{t('Schön, dass {name} dabei ist!', { name: firstName })}</p>}
              <button type="button" className="composer-trigger" onClick={() => onComposerChange(true)}>
                <Avatar dog={dog} size={40} />
                <span>{firstOne ? t('Erzählt die erste {entry}', { entry: words.entry }) : t('Was gibt’s Neues von {about}?', { about })}</span>
                <Icon name="plus" />
              </button>
              {/* „Fotos mitbringen“ als leiser Zweitweg im selben Feld - kein eigener Einstieg neben dem Erzählen. */}
              <div className="composer-extra">
                <Button variant="ghost" size="sm" className="chronicle-import" onClick={() => setImportOpen(true)}>
                  <Icon name="image" />
                  {t(IMPORT_TEXT.entry)}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
      {importOpen && (
        <Suspense fallback={null}>
          <FotoImportDialog
            dogId={dog.id}
            isHousehold={formProps.isHousehold}
            shareNames={formProps.shareNames}
            onCreated={(created) => setEntries((current) => [...current, ...created])}
            onClose={() => setImportOpen(false)}
          />
        </Suspense>
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
          onShareCard={setSharingEntry}
          mirror={mirror}
        />
      ) : (
        canWrite && !firstOne && <p className="muted chronicle-empty">{words.entriesEmpty}</p>
      )}
      {newestFirst && earlier}

      <Modal open={Boolean(editingEntry)} title={t('{entry} bearbeiten', { entry: words.entry })} onClose={() => setEditingEntry(null)}>
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
      <GrussKarteDialog entry={sharingEntry} dogName={firstName} onClose={() => setSharingEntry(null)} />
    </section>
  )
}
