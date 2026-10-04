import { useTheme } from '../themes/ThemeProvider.jsx'
import Icon from '../components/Icon.jsx'
import AnimalsTabs from '../components/animals/AnimalsTabs.jsx'
import AnimalCreateModal from '../components/AnimalCreateModal.jsx'
import useAreaAnimals from '../hooks/useAreaAnimals.js'
import useAnimalCreate from '../hooks/useAnimalCreate.js'
import { HOME_LABEL, areaContext } from '../lib/areas.js'
import { hasRole } from '../lib/roles.js'

// /tiere (Phase W) für das eigene Zuhause und klassische Familien-Logins - die eine Stelle für Tiere: Reiter Alle,
// Zeitleiste, Stammbaum und genau ein Knopf "Tier hinzufügen". Keine Neuigkeiten, kein Einladen, keine
// Kennzahlen: die stehen auf Start bzw. im Menü. Tierheime haben ihre eigene Seite (ShelterAnimalsPage).
export default function AnimalsPage({ family }) {
  const { words } = useTheme()
  const animals = useAreaAnimals()
  const creator = useAnimalCreate()
  const canWrite = hasRole(family, 'mitglied')
  const atHome = areaContext(family) === 'home'

  return (
    <div className="page animals-page">
      <header className="page-hero animals-hero">
        <div>
          <span className="eyebrow">{atHome ? HOME_LABEL : family.name}</span>
          <h1>{words.animals}</h1>
        </div>
        {/* Audit V7a: ohne Tiere steht "Erstes Tier anlegen" im Leerzustand - nicht zusätzlich hier oben. */}
        {canWrite && animals.dogs?.length > 0 && (
          <div className="hero-actions">
            <button type="button" className="btn btn-primary" onClick={() => creator.open()}>
              <Icon name="plus" />
              Tier hinzufügen
            </button>
          </div>
        )}
      </header>

      {animals.error && (
        <div className="error-banner" role="alert">
          {animals.error}
        </div>
      )}

      <AnimalsTabs family={family} animals={animals} canWrite={canWrite} onAddAnimal={creator.open} where="bei euch" />

      <AnimalCreateModal creator={creator} allDogs={animals.allDogs} ownFamilyId={family.id} />
    </div>
  )
}
