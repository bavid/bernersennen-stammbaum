import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import TabBar from '../TabBar.jsx'
import Icon from '../Icon.jsx'
import ThemeMark from '../ThemeMark.jsx'
import RouteFallback from '../RouteFallback.jsx'
import PedigreeTree from '../PedigreeTree.jsx'
import OffspringSection from '../OffspringSection.jsx'
import CompanionsView from './CompanionsView.jsx'
import AnimalGrid from './AnimalGrid.jsx'
import useTabParam from '../../hooks/useTabParam.js'
import { hasFamilyTree } from '../../lib/familyGroups.js'
import { hasSiblingLitters } from '../../lib/litters.js'
import { t } from '../../lib/i18n/index.js'

// Adresse ?ansicht=… (wie früher der Stammbaum-Umschalter, components/families/TreeToggle.jsx) - ohne Angabe "Alle".
export const ANIMALS_VIEW_PARAM = 'ansicht'
export const ALL_VIEWS = ['alle', 'zeitleiste', 'stammbaum']

// Den Stammbaum gibt es erst mit einer Verpaarung, Eltern oder Geschwistern (lib/familyGroups.js).
function treeAvailableFor({ dogs, allDogs, events }) {
  if (!dogs?.length) return false
  return hasFamilyTree({ dogs, allDogs, events: events || [] }) || hasSiblingLitters(dogs, events)
}

function tabsFor({ views, treeAvailable, treeWanted }) {
  return [
    { key: 'alle', label: t('Alle') },
    views.includes('zeitleiste') && { key: 'zeitleiste', label: t('Zeitleiste') },
    views.includes('stammbaum') && (treeAvailable || treeWanted) && { key: 'stammbaum', label: t('Stammbaum') }
  ].filter(Boolean)
}

function NoAnimals({ canWrite, onAddAnimal }) {
  const { words } = useTheme()
  return (
    <div className="empty-state">
      <ThemeMark size={72} />
      <h3>{t('Noch keine {animals}', { animals: words.animals })}</h3>
      {canWrite ? (
        <>
          <p>{t('Fangt mit dem ältesten Tier an, das ihr kennt – Eltern könnt ihr jederzeit ergänzen.')}</p>
          <button type="button" className="btn btn-primary" onClick={() => onAddAnimal()}>
            <Icon name="plus" />
            {t('Erstes Tier anlegen')}
          </button>
        </>
      ) : (
        <p>{t('Sobald hier {animals} angelegt oder hierher geteilt werden, stehen sie hier.', { animals: words.animals })}</p>
      )}
    </div>
  )
}

// Der Reiter „Alle“: das Raster (components/animals/AnimalGrid) - lädt noch, gescheitert (mit „Noch einmal versuchen“, nur wo
// retry da ist) oder leer (der erste Schritt).
function AllPanel({ grid, canWrite, onAddAnimal }) {
  if (grid.error) {
    return (
      <div className="empty-state" role="alert">
        <h3>{t('Das hat nicht geklappt')}</h3>
        <p>{grid.error}</p>
        {grid.retry && (
          <button type="button" className="btn btn-primary" onClick={grid.retry}>
            {t('Noch einmal versuchen')}
          </button>
        )}
      </div>
    )
  }
  if (!grid.data) return <RouteFallback />
  if (grid.data.tiere.length === 0) return <NoAnimals canWrite={canWrite} onAddAnimal={onAddAnimal} />
  return <AnimalGrid grid={grid.data} />
}

// Reiter der Tiere (Phase W) - auf /tiere und im Reiter "Tiere" der Gruppenseite: "Alle" (ruhiges Raster mit Filter je
// Bereich), "Zeitleiste" (früher Wegbegleiter) und "Stammbaum" (mit dem Nachwuchs darunter, sobald es einen gibt; die ganze
// Liste steht auf /wuerfe). grid: { data: { tiere, areas } | null, error, retry? } für "Alle" - auf /tiere aus GET /api/tiere
// (hooks/useAllAnimals.js), auf der Gruppenseite aus lib/animalGrid.js areaGrid. animals: hooks/useAreaAnimals.js (Zeitleiste,
// Stammbaum); views: welche Reiter es hier gibt (zu Besuch ohne Zeitleiste - die ist dort ein eigener Reiter der
// Gruppenseite); onAddAnimal(livesWith?): "Neues Tier anlegen".
export default function AnimalsTabs({ animals, grid, views = ALL_VIEWS, canWrite, onAddAnimal, where, readOnly, idPrefix = 'tiere' }) {
  const { words } = useTheme()
  const [searchParams] = useSearchParams()
  const { dogs, allDogs, links, events } = animals
  const loaded = dogs !== null && events !== null
  const treeAvailable = useMemo(() => treeAvailableFor({ dogs, allDogs, events }), [dogs, allDogs, events])
  const tabs = tabsFor({
    views,
    treeAvailable,
    // Ein Link auf ?ansicht=stammbaum wartet auf die Daten, statt kurz "Alle" aufblitzen zu lassen.
    treeWanted: !loaded && searchParams.get(ANIMALS_VIEW_PARAM) === 'stammbaum'
  })
  const [current, select] = useTabParam(ANIMALS_VIEW_PARAM, tabs)
  const panelId = `${idPrefix}-panel`

  function panel() {
    if (current === 'alle') return <AllPanel grid={grid} canWrite={canWrite} onAddAnimal={onAddAnimal} />
    if (!loaded) return <RouteFallback />
    if (current === 'zeitleiste') return <CompanionsView dogs={dogs} where={where} readOnly={readOnly} />
    if (dogs.length === 0) return <NoAnimals canWrite={canWrite} onAddAnimal={onAddAnimal} />
    return (
      <>
        <PedigreeTree dogs={dogs} allDogs={allDogs} links={links} onAddMitbewohner={canWrite ? onAddAnimal : undefined} />
        <OffspringSection dogs={dogs} events={events} canWrite={canWrite} />
      </>
    )
  }

  return (
    <div className="animals-tabs">
      <TabBar
        tabs={tabs}
        current={current}
        label={t('Ansichten der {animals}', { animals: words.animals })}
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
