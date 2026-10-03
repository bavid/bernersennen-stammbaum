import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import PedigreeTree from '../components/PedigreeTree.jsx'
import DogForm from '../components/DogForm.jsx'
import QuickAnimalForm from '../components/QuickAnimalForm.jsx'
import Modal from '../components/Modal.jsx'
import Icon from '../components/Icon.jsx'
import ThemeMark from '../components/ThemeMark.jsx'
import ActivityFeed from '../components/ActivityFeed.jsx'
import FamilySettings from '../components/FamilySettings.jsx'
import OffspringSection, { showsMatingHint } from '../components/OffspringSection.jsx'
import OverviewStats from '../components/OverviewStats.jsx'
import FamiliesView from '../components/families/FamiliesView.jsx'
import TreeToggle, { TREE_HINT, TREE_HINT_SHORT, TREE_PARAM, TREE_VALUE } from '../components/families/TreeToggle.jsx'
import useBreedingEvents from '../hooks/useBreedingEvents.js'
import useFriendHomes from '../hooks/useFriendHomes.js'
import useOpenArea from '../hooks/useOpenArea.js'
import { nextTermin } from '../lib/notes.js'
import { hasRole } from '../lib/roles.js'
import { isOwnHome, isVisit } from '../lib/visits.js'
import { useToast } from '../components/Toast.jsx'
import { buildFamilyGroups, familyStat, hasFamilyTree, overviewMode } from '../lib/familyGroups.js'
import { displayName } from '../lib/timeline.js'

export default function OverviewPage({ family, onFamilyChange, onInvite }) {
  const { theme, words } = useTheme()
  const [dogs, setDogs] = useState(null)
  const [allDogs, setAllDogs] = useState([])
  const [links, setLinks] = useState([])
  const [activity, setActivity] = useState(null)
  const [error, setError] = useState(null)
  // null: Modal zu. { livesWith, moreValues: null }: QuickAnimalForm (livesWith fest vorgegeben, sonst leer).
  // moreValues gesetzt: "Mehr Angaben …" gewechselt, zeigt stattdessen DogForm damit vorbefüllt.
  const [animalForm, setAnimalForm] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const navigate = useNavigate()
  const toast = useToast()
  // Rollen (Phase R): in einer Familie legt ab Mitglied Tiere an, lädt ab Stellvertretung ein - außerhalb
  // (eigenes Zuhause) darf man alles.
  const inGroup = family.art === 'rudel'
  const canWrite = hasRole(family, 'mitglied')
  // Phase V2: zu Besuch (Rolle gast) weder einladen noch Einstellungen - nur ansehen.
  const visiting = isVisit(family)
  const canInvite = !visiting && (!inGroup || hasRole(family, 'stellvertretung'))
  // Phase V3: Familien zuerst, Stammbaum als Zusatz (theme.familiesView) - der Berner-Auftritt zeigt den Baum direkt.
  const familiesView = Boolean(theme.familiesView)
  const [searchParams] = useSearchParams()
  const events = useBreedingEvents(familiesView || !theme.littersInNav)
  const friends = useFriendHomes(familiesView && isOwnHome(family))
  const openArea = useOpenArea(onFamilyChange)
  const treeAvailable = useMemo(
    () => familiesView && hasFamilyTree({ dogs: dogs || [], allDogs, events: events || [] }),
    [familiesView, dogs, allDogs, events]
  )
  const mode = overviewMode({
    familiesView,
    wantsTree: searchParams.get(TREE_PARAM) === TREE_VALUE,
    treeAvailable,
    loaded: dogs !== null && events !== null
  })
  const groups = useMemo(() => buildFamilyGroups({ family, dogs: dogs || [], friends: friends || [] }), [family, dogs, friends])
  const showTreeToggle = familiesView && dogs?.length > 0 && (mode === 'tree' || treeAvailable)
  // Phase V3: ohne Verpaarung und Eltern der leise Hinweis auf den Stammbaum - nur für die, die eine eintragen dürfen.
  // Audit V7a: steht schon die leise Zeile "Nachwuchs geplant? Verpaarung eintragen →" da, gehört er in diese Zeile.
  const showTreeHint = mode === 'families' && events !== null && !treeAvailable && canWrite
  const treeHintInLine = showTreeHint && !theme.littersInNav && showsMatingHint({ dogs, events, canWrite })

  async function loadDogs() {
    const [own, all, recent, notes, dogLinks] = await Promise.all([
      api.listDogs(),
      api.listAllDogs(),
      api.recentActivity(4),
      api.listNotes(),
      api.listLinks()
    ])
    setDogs(own)
    setAllDogs(all)
    setLinks(dogLinks)
    setActivity({ entries: recent, termin: nextTermin(notes) })
  }

  useEffect(() => {
    loadDogs().catch((err) => setError(err.message))
  }, [])

  // Ist der aktive Bereich gerade das eigene Zuhause (family.id === family.home.id), zeigt der
  // Bereichswechsler den Haushaltsnamen als Zusatz zu "Meine Chronik" – der muss beim Umbenennen
  // mitziehen, sonst zeigt er nach dem Speichern noch den alten Namen.
  function handleRenamed(renamed) {
    setSettingsOpen(false)
    const merged = { ...family, ...renamed }
    if (family.home?.id === family.id) merged.home = { ...family.home, name: renamed.name }
    onFamilyChange(merged)
    toast(`${words.TheGroup} heißt jetzt „${renamed.name}“`)
  }

  function handleThemeSaved(updated) {
    setSettingsOpen(false)
    onFamilyChange({ ...family, ...updated })
    toast('Neues Aussehen gespeichert')
  }

  function openAnimalForm(livesWith = null) {
    setAnimalForm({ livesWith, moreValues: null })
  }

  function closeAnimalForm() {
    setAnimalForm(null)
  }

  function announceCreated(dog) {
    closeAnimalForm()
    toast(`${displayName(dog)} ist jetzt dabei`)
    navigate(`/tier/${dog.id}`)
  }

  // "Mehr Angaben …" aus QuickAnimalForm: volles DogForm übernimmt selbst das Anlegen
  async function handleCreate(payload) {
    const dog = await api.createDog(payload)
    announceCreated(dog)
  }

  return (
    <div className="page">
      <header className="page-hero">
        <div>
          <span className="eyebrow">{words.treeLabel}</span>
          <div className="page-title-row">
            <h1>{family.name}</h1>
            {!visiting && (
              <button
                type="button"
                className="icon-btn title-edit"
                onClick={() => setSettingsOpen(true)}
                aria-label={words.groupSettings}
                title={words.groupSettings}
              >
                <Icon name="edit" />
              </button>
            )}
          </div>
          <p className="page-lede">{theme.texts.overviewLede}</p>
          {inGroup && (
            <p className="hero-hint">
              <Link to="/mitglieder">Mitglieder & Rollen →</Link>
            </p>
          )}
        </div>
        <div className="page-hero-side">
          {dogs && dogs.length > 0 && (
            <OverviewStats dogs={dogs} allDogs={allDogs} links={links} familyStat={familiesView ? familyStat(family, groups) : undefined} />
          )}
          {(canWrite || canInvite || showTreeToggle) && (
            <div className="hero-actions">
              {canWrite && (
                <button type="button" className="btn btn-primary btn-lg" onClick={() => openAnimalForm()}>
                  <Icon name="plus" />
                  Tier hinzufügen
                </button>
              )}
              {canInvite && (
                <button type="button" className="btn btn-ghost btn-lg" onClick={onInvite}>
                  <Icon name="send" />
                  Jemanden einladen
                </button>
              )}
              {showTreeToggle && <TreeToggle mode={mode} treeAvailable={treeAvailable} />}
            </div>
          )}
        </div>
      </header>

      {error && <div className="error-banner" role="alert">{error}</div>}

      {dogs && dogs.length === 0 && (
        <div className="empty-state">
          <ThemeMark size={72} />
          <h3>{words.treeEmpty}</h3>
          {canWrite ? (
            <>
              <p>Fangt mit dem ältesten Tier an, das ihr kennt – Eltern könnt ihr jederzeit ergänzen.</p>
              <button type="button" className="btn btn-primary" onClick={() => openAnimalForm()}>
                <Icon name="plus" />
                Erstes Tier anlegen
              </button>
            </>
          ) : (
            <p>Sobald Mitglieder Tiere anlegen oder eigene hierher teilen, stehen sie hier.</p>
          )}
        </div>
      )}

      {dogs && dogs.length > 0 && activity && <ActivityFeed entries={activity.entries} termin={activity.termin} />}

      {dogs && dogs.length > 0 && mode === 'tree' && (
        <PedigreeTree dogs={dogs} allDogs={allDogs} links={links} onAddMitbewohner={canWrite ? openAnimalForm : undefined} />
      )}

      {dogs && dogs.length > 0 && mode === 'families' && (
        <FamiliesView groups={groups} dogs={dogs} allDogs={allDogs} links={links} onOpenArea={openArea} />
      )}

      {/* Phase U: ohne eigenen Reiter (Standard-Auftritt) steht der Nachwuchs hier - nur, wenn es welchen gibt.
          Phase V3: darunter bzw. in dessen leiser Zeile der Hinweis auf den Stammbaum (showTreeHint, treeHintInLine). */}
      {dogs && dogs.length > 0 && (
        <div className="overview-foot">
          {!theme.littersInNav && (
            <OffspringSection dogs={dogs} events={events} canWrite={canWrite} treeHint={treeHintInLine ? TREE_HINT_SHORT : null} />
          )}
          {showTreeHint && !treeHintInLine && <p className="muted families-tree-hint">{TREE_HINT}</p>}
        </div>
      )}

      <Modal open={settingsOpen} title={words.groupSettings} onClose={() => setSettingsOpen(false)}>
        <FamilySettings
          family={family}
          onRenamed={handleRenamed}
          onChange={handleThemeSaved}
          onFamilyChange={onFamilyChange}
          onCancel={() => setSettingsOpen(false)}
        />
      </Modal>

      <Modal open={Boolean(animalForm)} title="Neues Tier anlegen" onClose={closeAnimalForm}>
        {animalForm &&
          (animalForm.moreValues ? (
            <DogForm
              allDogs={allDogs}
              ownFamilyId={family.id}
              initialValues={animalForm.moreValues}
              onSubmit={handleCreate}
              onCancel={closeAnimalForm}
            />
          ) : (
            <QuickAnimalForm
              allDogs={allDogs}
              livesWith={animalForm.livesWith}
              onCreated={announceCreated}
              onCancel={closeAnimalForm}
              onMore={(moreValues) => setAnimalForm((current) => ({ ...current, moreValues }))}
            />
          ))}
      </Modal>
    </div>
  )
}
