import { useTheme } from '../themes/ThemeProvider.jsx'
import Icon from '../components/Icon.jsx'
import AnimalsTabs from '../components/animals/AnimalsTabs.jsx'
import AnimalCreateModal from '../components/AnimalCreateModal.jsx'
import useAreaAnimals from '../hooks/useAreaAnimals.js'
import useAllAnimals from '../hooks/useAllAnimals.js'
import useAnimalCreate from '../hooks/useAnimalCreate.js'
import { HOME_LABEL, areaContext } from '../lib/areas.js'
import { hasRole } from '../lib/roles.js'
import { t } from '../lib/i18n/index.js'
import { Button } from '../components/ui/index.js'

// /tiere (Phase W) für das eigene Zuhause und klassische Familien-Logins - die eine Stelle für Tiere: Reiter Alle (seit
// Schritt 4 alle Tiere aus Zuhause, Familien und befreundeten Zuhause, GET /api/tiere), Zeitleiste und Stammbaum (beide das
// eigene Zuhause) und genau ein Knopf "Tier hinzufügen" (immer ins eigene Zuhause). Keine Neuigkeiten, kein Einladen, keine
// Kennzahlen: die stehen auf Start bzw. im Menü. Tierheime haben ihre eigene Seite (ShelterAnimalsPage).
export default function AnimalsPage({ family }) {
  const { words } = useTheme()
  const animals = useAreaAnimals()
  const all = useAllAnimals()
  const creator = useAnimalCreate()
  const canWrite = hasRole(family, 'mitglied')
  const atHome = areaContext(family) === 'home'
  const hasAnimals = animals.dogs?.length > 0 || all.data?.tiere.length > 0

  return (
    <div className="page animals-page">
      <header className="page-hero animals-hero">
        <div>
          <span className="eyebrow">{atHome ? t(HOME_LABEL) : family.name}</span>
          <h1>{words.animals}</h1>
        </div>
        {/* Audit V7a: ohne Tiere steht "Erstes Tier anlegen" im Leerzustand - nicht zusätzlich hier oben. */}
        {canWrite && hasAnimals && (
          <div className="hero-actions">
            <Button type="button" onClick={() => creator.open()}>
              <Icon name="plus" />
              {t('Tier hinzufügen')}
            </Button>
          </div>
        )}
      </header>

      {animals.error && (
        <div className="error-banner" role="alert">
          {animals.error}
        </div>
      )}

      <AnimalsTabs animals={animals} grid={all} canWrite={canWrite} onAddAnimal={creator.open} where="bei euch" />

      <AnimalCreateModal creator={creator} allDogs={animals.allDogs} ownFamilyId={family.id} />
    </div>
  )
}
