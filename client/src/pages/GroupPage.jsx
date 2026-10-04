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
import VisitChip from '../components/visits/VisitChip.jsx'
import PinboardPage from './PinboardPage.jsx'
import useAreaAnimals from '../hooks/useAreaAnimals.js'
import useAnimalCreate from '../hooks/useAnimalCreate.js'
import useTabParam from '../hooks/useTabParam.js'
import { animalCountText, areaCounts, countsFromDogs } from '../lib/animalCounts.js'
import { hasRole } from '../lib/roles.js'
import { areaGrid } from '../lib/animalGrid.js'
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

// Kleine Zeile unter dem Namen (Phase W, Schritt 2: überall dieselbe Zählung, lib/animalCounts.js): "21 Tiere · davon 4
// von euch" - aus den geladenen Tieren (nach Anlegen oder Löschen sofort richtig), bis dahin aus me (GET /api/me).
function groupMeta(family, dogs, words) {
  return animalCountText(countsFromDogs(dogs, family.home?.id) ?? areaCounts(family, family.id), words)
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
  const meta = groupMeta(family, animals.dogs, words)
  // Reiter Tiere › Alle: dasselbe Raster wie /tiere, nur mit den Tieren dieses Bereichs (lib/animalGrid.js areaGrid).
  const grid = useMemo(() => ({ data: areaGrid(family, animals.dogs, { visiting }), error: null }), [family, animals.dogs, visiting])

  return (
    <div className="page group-page">
      <header className="page-hero group-hero">
        <div>
          <span className="eyebrow">{visiting ? 'Befreundetes Zuhause' : words.group}</span>
          <h1>{family.name}</h1>
          {meta && <p className="group-meta">{meta}</p>}
          {/* Phase W, Schritt 2: zu Besuch ein Chip im Kopf statt des Bands in der Leiste oben. */}
          {visiting && <VisitChip name={family.name} />}
        </div>
        {!visiting && (
          <div className="hero-actions">
            {/* Phase W, Schritt 2: "Familie verwalten" ist Einstellungen › Familien › [Familie] - kein Dialog mehr. */}
            {/* B+ Familienalbum: die Fotos der Familie als Diashow (pages/BilderrahmenPage.jsx, Gate über ?in=). */}
            <Link to={`/bilderrahmen?in=${family.id}`} className="btn btn-ghost">
              <Icon name="frame" />
              Bilderrahmen
            </Link>
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
            animals={animals}
            grid={grid}
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
