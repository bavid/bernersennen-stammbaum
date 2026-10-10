import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { parseAreaId } from '../lib/areas.js'
import { t } from '../lib/i18n/index.js'

// Die Id aus der Adresse muss eine ganze Zahl sein (security-review W2) - sonst ginge z. B. "/tier/..%2F.." als Pfad an
// eine andere API-Adresse.
const NOT_FOUND = 'Dieses Tier gibt es hier nicht.'

// Daten der Tierseite (Phase W, Schritt 2 aus DogDetailPage herausgelöst): das Tier, seine Einträge, die Verpaarungen
// (für die Meilensteine der Chronik) und alle Tiere des Bereichs (Mitbewohner, Eltern im Bearbeiten-Dialog). Wechselt
// die Id, beginnt alles von vorn; eine verspätete Antwort des vorherigen Tiers überschreibt nichts (isCurrent).
// load() lädt neu (nach Übernehmen, Bearbeiten, einem neuen Mitbewohner).
export default function useDogPage(rawId) {
  const id = parseAreaId(rawId)
  const [dog, setDog] = useState(null)
  const [entries, setEntries] = useState([])
  const [breedingEvents, setBreedingEvents] = useState([])
  const [allDogs, setAllDogs] = useState([])
  const [error, setError] = useState(null)

  const load = useCallback(
    async (isCurrent = () => true) => {
      if (!id) throw new Error(t(NOT_FOUND))
      const [dogData, timelineData, breedingData, allDogsData] = await Promise.all([
        api.getDog(id),
        api.listTimeline(id),
        api.listBreedingEvents(),
        api.listAllDogs()
      ])
      if (!isCurrent()) return
      setDog(dogData)
      setEntries(timelineData)
      setBreedingEvents(breedingData)
      setAllDogs(allDogsData)
    },
    [id]
  )

  useEffect(() => {
    let current = true
    setDog(null)
    setError(null)
    load(() => current).catch((err) => current && setError(err.message))
    return () => {
      current = false
    }
  }, [load])

  return { dog, setDog, entries, setEntries, breedingEvents, allDogs, error, load }
}
