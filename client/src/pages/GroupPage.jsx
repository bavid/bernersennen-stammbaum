import { Suspense, lazy, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTheme } from '../themes/ThemeProvider.jsx'
import Icon from '../components/Icon.jsx'
import TabBar from '../components/TabBar.jsx'
import RouteFallback from '../components/RouteFallback.jsx'
import AnimalsTabs from '../components/animals/AnimalsTabs.jsx'
import CompanionsView from '../components/animals/CompanionsView.jsx'
import AnimalCreateModal from '../components/AnimalCreateModal.jsx'
import GroupPosts from '../components/group/GroupPosts.jsx'
import PinboardPage from './PinboardPage.jsx'
import useAreaAnimals from '../hooks/useAreaAnimals.js'
import useAnimalCreate from '../hooks/useAnimalCreate.js'
import useTabParam from '../hooks/useTabParam.js'
import { familyAnimals } from '../lib/familyGroups.js'
import { hasRole } from '../lib/roles.js'
import { familySettingsRoute } from '../lib/areas.js'
import { isVisit } from '../lib/visits.js'

// Mitglieder & Rollen (Phase R) kommen wie bisher erst bei Bedarf als eigener Chunk.
const MembersPage = lazy(() => import('./MembersPage.jsx'))

// Adresse ?reiter=… - ohne Angabe "Beiträge". Beim Wechsel fallen die Unter-Reiter der Tiere (?ansicht, ?gruppe) weg.
export const GROUP_TAB_PARAM = 'reiter'
const GROUP_TAB_DROP = ['ansicht', 'gruppe']

function tabsFor(visiting, words) {
  if (visiting) {
    return [
      { key: 'beitraege', label: words.entries },
      { key: 'tiere', label: words.animals },
      { key: 'zeitleiste', label: 'Zeitleiste' }
    ]
  }
  return [
    { key: 'beitraege', label: words.entries },
    { key: 'tiere', label: words.animals },
    { key: 'pinnwand', label: 'Pinnwand' },
    { key: 'mitglieder', label: 'Mitglieder' }
  ]
}

// Kleine Zeile unter dem Namen: wie viele Tiere hier zu sehen sind und aus wie vielen Zuhause sie kommen.
function groupMeta(dogs, words) {
  if (!dogs) return null
  const animals = familyAnimals(dogs)
  const homes = new Set(animals.filter((dog) => dog.shared_from).map((dog) => dog.family_id ?? dog.shared_from))
  const parts = [`${animals.length} ${animals.length === 1 ? words.animal : words.animals}`]
  if (homes.size > 0) parts.push(`aus ${homes.size} Zuhause`)
  return parts.join(' · ')
}

// /familien/:id (Phase W) - eine Familie als Gruppenseite, hinter dem AreaGate (der Bereich ist hier immer aktiv): Kopf
// mit Name, kleiner Zeile und "Familie verwalten", darunter die Reiter Beiträge · Tiere · Pinnwand · Mitglieder. Zu
// Besuch in einem befreundeten Zuhause nur lesen: Beiträge · Tiere · Zeitleiste.
export default function GroupPage({ family, onFamilyChange }) {
  const { words } = useTheme()
  const visiting = isVisit(family)
  const tabs = useMemo(() => tabsFor(visiting, words), [visiting, words])
  const [current, select] = useTabParam(GROUP_TAB_PARAM, tabs, { drop: GROUP_TAB_DROP })
  const animals = useAreaAnimals()
  const creator = useAnimalCreate()
  const canWrite = !visiting && hasRole(family, 'mitglied')
  const meta = groupMeta(animals.dogs, words)

  return (
    <div className="page group-page">
      <header className="page-hero group-hero">
        <div>
          <span className="eyebrow">{visiting ? 'Befreundetes Zuhause' : words.group}</span>
          <h1>{family.name}</h1>
          {meta && <p className="group-meta">{meta}</p>}
        </div>
        {!visiting && (
          <div className="hero-actions">
            {/* Phase W, Schritt 2: "Familie verwalten" ist Einstellungen › Familien › [Familie] - kein Dialog mehr. */}
            <Link to={familySettingsRoute(family.id)} className="btn btn-ghost">
              <Icon name="settings" />
              {words.groupSettings}
            </Link>
          </div>
        )}
      </header>

      {animals.error && (
        <div className="error-banner" role="alert">
          {animals.error}
        </div>
      )}

      <TabBar
        tabs={tabs}
        current={current}
        label={`Bereiche von ${family.name}`}
        idPrefix="gruppe-tab"
        panelId="gruppe-panel"
        className="group-tab-bar"
        onSelect={select}
      />
      <div className="group-panel" id="gruppe-panel" role="tabpanel" aria-labelledby={`gruppe-tab-${current}`}>
        {current === 'beitraege' && <GroupPosts family={family} dogs={animals.dogs} canWrite={canWrite} visiting={visiting} />}
        {current === 'tiere' && (
          <AnimalsTabs
            family={family}
            animals={animals}
            views={visiting ? ['alle', 'stammbaum'] : undefined}
            canWrite={canWrite}
            onAddAnimal={creator.open}
            where={visiting ? 'hier' : 'bei euch'}
            readOnly={visiting}
            idPrefix="gruppe-tiere"
          />
        )}
        {current === 'zeitleiste' && (animals.dogs ? <CompanionsView dogs={animals.dogs} where="hier" readOnly /> : <RouteFallback />)}
        {current === 'pinnwand' && <PinboardPage family={family} embedded />}
        {current === 'mitglieder' && (
          <Suspense fallback={<RouteFallback />}>
            <MembersPage family={family} onFamilyChange={onFamilyChange} embedded />
          </Suspense>
        )}
      </div>

      <AnimalCreateModal creator={creator} allDogs={animals.allDogs} ownFamilyId={family.id} />
    </div>
  )
}
