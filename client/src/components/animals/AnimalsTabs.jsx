import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import TabBar from '../TabBar.jsx'
import Icon from '../Icon.jsx'
import ThemeMark from '../ThemeMark.jsx'
import RouteFallback from '../RouteFallback.jsx'
import PedigreeTree from '../PedigreeTree.jsx'
import OffspringSection from '../OffspringSection.jsx'
import FamiliesView from '../families/FamiliesView.jsx'
import CompanionsView from './CompanionsView.jsx'
import LittersPage from '../../pages/LittersPage.jsx'
import useTabParam from '../../hooks/useTabParam.js'
import { buildFamilyGroups, familyAnimals, hasFamilyTree } from '../../lib/familyGroups.js'
import { hasSiblingLitters } from '../../lib/litters.js'

// Adresse ?ansicht=… (wie früher der Stammbaum-Umschalter, components/families/TreeToggle.jsx) - ohne Angabe "Alle".
export const ANIMALS_VIEW_PARAM = 'ansicht'
export const ALL_VIEWS = ['alle', 'zeitleiste', 'stammbaum', 'wuerfe']

// Den Stammbaum gibt es im Standard-Auftritt erst mit einer Verpaarung, Eltern oder Geschwistern (lib/familyGroups.js);
// der Berner-Auftritt zeigt ihn wie bisher immer, sobald es Tiere gibt.
function treeAvailableFor({ theme, dogs, allDogs, events }) {
  if (!dogs?.length) return false
  if (!theme.familiesView) return true
  return hasFamilyTree({ dogs, allDogs, events: events || [] }) || hasSiblingLitters(dogs, events)
}

function tabsFor({ views, treeAvailable, treeWanted, littersLabel, littersInNav }) {
  return [
    { key: 'alle', label: 'Alle' },
    views.includes('zeitleiste') && { key: 'zeitleiste', label: 'Zeitleiste' },
    views.includes('stammbaum') && (treeAvailable || treeWanted) && { key: 'stammbaum', label: 'Stammbaum' },
    views.includes('wuerfe') && littersInNav && { key: 'wuerfe', label: littersLabel }
  ].filter(Boolean)
}

function NoAnimals({ canWrite, onAddAnimal }) {
  const { words } = useTheme()
  return (
    <div className="empty-state">
      <ThemeMark size={72} />
      <h3>Noch keine {words.animals}</h3>
      {canWrite ? (
        <>
          <p>Fangt mit dem ältesten Tier an, das ihr kennt – Eltern könnt ihr jederzeit ergänzen.</p>
          <button type="button" className="btn btn-primary" onClick={() => onAddAnimal()}>
            <Icon name="plus" />
            Erstes Tier anlegen
          </button>
        </>
      ) : (
        <p>Sobald hier {words.animals} angelegt oder hierher geteilt werden, stehen sie hier.</p>
      )}
    </div>
  )
}

// Reiter der Tiere (Phase W) - auf /tiere und im Reiter "Tiere" der Gruppenseite: "Alle" (ruhiges Raster mit Filter je
// Eigentümer), "Zeitleiste" (früher Wegbegleiter), "Stammbaum" (mit dem Nachwuchs darunter, sobald es einen gibt) und im
// Berner-Auftritt "Würfe". animals: hooks/useAreaAnimals.js; views: welche Reiter es hier gibt (zu Besuch ohne
// Zeitleiste - die ist dort ein eigener Reiter der Gruppenseite); onAddAnimal(livesWith?): "Neues Tier anlegen".
export default function AnimalsTabs({ family, animals, views = ALL_VIEWS, canWrite, onAddAnimal, where, readOnly, idPrefix = 'tiere' }) {
  const { theme, words } = useTheme()
  const [searchParams] = useSearchParams()
  const { dogs, allDogs, links, events } = animals
  const loaded = dogs !== null && events !== null
  const treeAvailable = useMemo(() => treeAvailableFor({ theme, dogs, allDogs, events }), [theme, dogs, allDogs, events])
  const tabs = tabsFor({
    views,
    treeAvailable,
    // Ein Link auf ?ansicht=stammbaum wartet auf die Daten, statt kurz "Alle" aufblitzen zu lassen.
    treeWanted: !loaded && searchParams.get(ANIMALS_VIEW_PARAM) === 'stammbaum',
    littersLabel: words.littersLabel,
    littersInNav: theme.littersInNav
  })
  const [current, select] = useTabParam(ANIMALS_VIEW_PARAM, tabs)
  const gridDogs = useMemo(() => familyAnimals(dogs || []), [dogs])
  const groups = useMemo(() => buildFamilyGroups({ family, dogs: gridDogs }), [family, gridDogs])
  const panelId = `${idPrefix}-panel`

  function panel() {
    if (!loaded) return <RouteFallback />
    if (current === 'wuerfe') return <LittersPage family={family} embedded />
    if (current === 'zeitleiste') return <CompanionsView dogs={dogs} where={where} readOnly={readOnly} />
    if (dogs.length === 0) return <NoAnimals canWrite={canWrite} onAddAnimal={onAddAnimal} />
    if (current === 'stammbaum') {
      return (
        <>
          <PedigreeTree dogs={dogs} allDogs={allDogs} links={links} onAddMitbewohner={canWrite ? onAddAnimal : undefined} />
          {!theme.littersInNav && <OffspringSection dogs={dogs} events={events} canWrite={canWrite} />}
        </>
      )
    }
    return <FamiliesView groups={groups} hideTitle />
  }

  return (
    <div className="animals-tabs">
      <TabBar
        tabs={tabs}
        current={current}
        label={`Ansichten der ${words.animals}`}
        idPrefix={`${idPrefix}-tab`}
        panelId={panelId}
        className="animals-tab-bar"
        onSelect={select}
      />
      <div className="animals-panel" id={panelId} role="tabpanel" aria-labelledby={`${idPrefix}-tab-${current}`}>
        {panel()}
      </div>
    </div>
  )
}
