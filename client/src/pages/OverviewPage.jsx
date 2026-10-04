import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import PedigreeTree from '../components/PedigreeTree.jsx'
import AnimalCreateModal from '../components/AnimalCreateModal.jsx'
import Icon from '../components/Icon.jsx'
import ThemeMark from '../components/ThemeMark.jsx'
import ActivityFeed from '../components/ActivityFeed.jsx'
import OffspringSection from '../components/OffspringSection.jsx'
import OverviewStats from '../components/OverviewStats.jsx'
import FamiliesView from '../components/families/FamiliesView.jsx'
import TreeToggle, { TREE_PARAM, TREE_VALUE } from '../components/families/TreeToggle.jsx'
import useBreedingEvents from '../hooks/useBreedingEvents.js'
import useAnimalCreate from '../hooks/useAnimalCreate.js'
import { nextTermin } from '../lib/notes.js'
import { hasRole } from '../lib/roles.js'
import { buildFamilyGroups, familyAnimals, hasFamilyTree, overviewMode } from '../lib/familyGroups.js'
import { hasSiblingLitters } from '../lib/litters.js'

// Familienbande eines Tierheims (/stammbaum und /familienbande, AreaRoutes ShelterRoutes): Raster aller Tiere, auf Wunsch
// Stammbaum mit Nachwuchs. Haushalte und Familien haben seit Phase W „Tiere“ (AnimalsPage) und die Gruppenseite - die
// alten Adressen leiten dorthin (LegacyRedirect), darum hier keine Zweige mehr für Zuhause, Familie oder Besuch.
export default function OverviewPage({ family, onInvite }) {
  const { theme, words } = useTheme()
  const [dogs, setDogs] = useState(null)
  const [allDogs, setAllDogs] = useState([])
  const [links, setLinks] = useState([])
  const [activity, setActivity] = useState(null)
  const [error, setError] = useState(null)
  const animalCreate = useAnimalCreate()
  // Im eigenen Bereich ist man Leitung (lib/roles.js) - die Demo und die Admin-Ansicht schützt der Server.
  const canWrite = hasRole(family, 'mitglied')
  // Phase V3: Familien zuerst, Stammbaum als Zusatz.
  const [searchParams] = useSearchParams()
  const events = useBreedingEvents()
  // Familienbande 2: "Stammbaum & Nachwuchs" gibt es, sobald es einen Baum oder Geschwister zu zeigen gibt.
  const treeAvailable = useMemo(
    () => hasFamilyTree({ dogs: dogs || [], allDogs, events: events || [] }) || hasSiblingLitters(dogs, events),
    [dogs, allDogs, events]
  )
  const mode = overviewMode({
    wantsTree: searchParams.get(TREE_PARAM) === TREE_VALUE,
    treeAvailable,
    loaded: dogs !== null && events !== null
  })
  // Familienbande 2: unbekannte Eltern stehen nur im Stammbaum - Raster, Filter und Kennzahlen zählen sie nicht mit.
  const gridDogs = useMemo(() => familyAnimals(dogs || []), [dogs])
  const groups = useMemo(() => buildFamilyGroups({ family, dogs: gridDogs }), [family, gridDogs])
  const showTreeToggle = dogs?.length > 0 && (mode === 'tree' || treeAvailable)
  // Der Stammbaum (mit dem Nachwuchs darunter) ist eine Ansicht für sich - die Neuigkeiten stehen bei den Familien.
  const showFeed = mode === 'families'

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

  const openAnimalForm = animalCreate.open

  return (
    <div className="page">
      <header className="page-hero families-hero">
        <div>
          <span className="eyebrow">{words.treeLabel}</span>
          {/* Phase W, Schritt 2: kein Stift mehr - der Name steht in den Einstellungen bzw. im Profil. */}
          <h1>{family.name}</h1>
          <p className="page-lede">{canWrite ? theme.texts.overviewLede : theme.texts.overviewLedeReadOnly}</p>
        </div>
        <div className="page-hero-side">
          {dogs && dogs.length > 0 && <OverviewStats dogs={gridDogs} />}
          <div className="hero-actions">
            {/* Audit V7a: ohne Tiere steht "Erstes Tier anlegen" im Leerzustand - nicht zusätzlich hier oben. */}
            {canWrite && dogs?.length !== 0 && (
              <button type="button" className="btn btn-primary btn-lg" onClick={() => openAnimalForm()}>
                <Icon name="plus" />
                Tier hinzufügen
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-lg" onClick={onInvite}>
              <Icon name="send" />
              Jemanden einladen
            </button>
            {showTreeToggle && <TreeToggle mode={mode} treeAvailable={treeAvailable} />}
          </div>
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

      {dogs && dogs.length > 0 && activity && showFeed && <ActivityFeed entries={activity.entries} termin={activity.termin} />}

      {dogs && dogs.length > 0 && mode === 'tree' && (
        <PedigreeTree dogs={dogs} allDogs={allDogs} links={links} onAddMitbewohner={canWrite ? openAnimalForm : undefined} />
      )}

      {/* Phase U: der Nachwuchs steht beim Stammbaum - nur, wenn es welchen gibt (Familienbande 2: nicht mehr unter den
          Familien). */}
      {dogs && dogs.length > 0 && mode === 'tree' && (
        <OffspringSection dogs={dogs} events={events} canWrite={canWrite} />
      )}

      {dogs && dogs.length > 0 && mode === 'families' && <FamiliesView groups={groups} />}

      <AnimalCreateModal creator={animalCreate} allDogs={allDogs} ownFamilyId={family.id} />
    </div>
  )
}
