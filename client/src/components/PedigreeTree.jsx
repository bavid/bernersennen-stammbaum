import { useMemo } from 'react'
import DogCard from './DogCard.jsx'

function computeGenerations(dogs) {
  const byId = new Map(dogs.map((dog) => [dog.id, dog]))
  const generationById = new Map()

  function generationOf(dogId, visiting = new Set()) {
    if (generationById.has(dogId)) return generationById.get(dogId)
    if (visiting.has(dogId)) return 0 // Zyklus-Schutz
    visiting.add(dogId)

    const dog = byId.get(dogId)
    const parentGenerations = [dog.mother_dog_id, dog.father_dog_id]
      .filter((parentId) => parentId && byId.has(parentId))
      .map((parentId) => generationOf(parentId, visiting))

    const generation = parentGenerations.length ? Math.max(...parentGenerations) + 1 : 0
    generationById.set(dogId, generation)
    return generation
  }

  dogs.forEach((dog) => generationOf(dog.id))
  return generationById
}

export default function PedigreeTree({ dogs }) {
  const generations = useMemo(() => {
    if (!dogs.length) return []
    const generationById = computeGenerations(dogs)
    const maxGeneration = Math.max(...generationById.values())
    const rows = Array.from({ length: maxGeneration + 1 }, () => [])
    dogs.forEach((dog) => rows[generationById.get(dog.id)].push(dog))
    return rows
  }, [dogs])

  if (!dogs.length) {
    return <p className="empty-state">Noch keine Hunde erfasst. Lege den ersten Hund an.</p>
  }

  return (
    <div>
      {generations.map((rowDogs, index) => (
        <div className="pedigree-generation" data-label={`Generation ${index + 1}`} key={index}>
          {rowDogs.map((dog) => (
            <DogCard dog={dog} key={dog.id} />
          ))}
        </div>
      ))}
    </div>
  )
}
