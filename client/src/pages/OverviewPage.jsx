import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
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
import useFriendHomes from '../hooks/useFriendHomes.js'
import useOpenArea from '../hooks/useOpenArea.js'
import useAnimalCreate from '../hooks/useAnimalCreate.js'
import { nextTermin } from '../lib/notes.js'
import { hasRole } from '../lib/roles.js'
import { isOwnHome, isVisit } from '../lib/visits.js'
import { buildFamilyGroups, familyAnimals, familyStat, hasFamilyTree, overviewMode } from '../lib/familyGroups.js'
import { hasSiblingLitters } from '../lib/litters.js'

export default function OverviewPage({ family, onInvite }) {
  const { theme, words } = useTheme()
  const [dogs, setDogs] = useState(null)
  const [allDogs, setAllDogs] = useState([])
  const [links, setLinks] = useState([])
  const [activity, setActivity] = useState(null)
  const [error, setError] = useState(null)
  const animalCreate = useAnimalCreate()
  // Rollen (Phase R): in einer Familie legt ab Mitglied Tiere an, lädt ab Stellvertretung ein - außerhalb
  // (eigenes Zuhause) darf man alles.
  const inGroup = family.art === 'rudel'
  const canWrite = hasRole(family, 'mitglied')
  // Phase V2: zu Besuch (Rolle gast) weder einladen noch Einstellungen - nur ansehen.
  const visiting = isVisit(family)
  const canInvite = !visiting && (!inGroup || hasRole(family, 'stellvertretung'))
  // Phase V3: Familien zuerst, Stammbaum als Zusatz.
  const [searchParams] = useSearchParams()
  const events = useBreedingEvents()
  const friends = useFriendHomes(isOwnHome(family))
  const openArea = useOpenArea(family)
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
  const groups = useMemo(() => buildFamilyGroups({ family, dogs: gridDogs, friends: friends || [] }), [family, gridDogs, friends])
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
          {inGroup && (
            <p className="hero-hint">
              <Link to="/mitglieder">Mitglieder & Rollen →</Link>
            </p>
          )}
        </div>
        <div className="page-hero-side">
          {dogs && dogs.length > 0 && (
            <OverviewStats dogs={gridDogs} familyStat={familyStat(family, groups)} />
          )}
          {(canWrite || canInvite || showTreeToggle) && (
            <div className="hero-actions">
              {/* Audit V7a: ohne Tiere steht "Erstes Tier anlegen" im Leerzustand - nicht zusätzlich hier oben. */}
              {canWrite && dogs?.length !== 0 && (
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

      {dogs && dogs.length > 0 && activity && showFeed && <ActivityFeed entries={activity.entries} termin={activity.termin} />}

      {dogs && dogs.length > 0 && mode === 'tree' && (
        <PedigreeTree dogs={dogs} allDogs={allDogs} links={links} onAddMitbewohner={canWrite ? openAnimalForm : undefined} />
      )}

      {/* Phase U: der Nachwuchs steht beim Stammbaum - nur, wenn es welchen gibt (Familienbande 2: nicht mehr unter den
          Familien). */}
      {dogs && dogs.length > 0 && mode === 'tree' && (
        <OffspringSection dogs={dogs} events={events} canWrite={canWrite} />
      )}

      {dogs && dogs.length > 0 && mode === 'families' && <FamiliesView groups={groups} onOpenArea={openArea} />}

      <AnimalCreateModal creator={animalCreate} allDogs={allDogs} ownFamilyId={family.id} />
    </div>
  )
}
