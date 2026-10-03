import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import PreviewFrame from './PreviewFrame.jsx'
import SteckbriefPage from '../pages/SteckbriefPage.jsx'

const LOAD_ERROR = 'Eure Tiere konnten gerade nicht geladen werden. Bitte versucht es gleich noch einmal.'

// Nur eigene Tiere des Tierheims - "ehemalige" (shared_from, mitgelesen) gehören einem anderen Bereich,
// die Vorschau (GET /api/partner-area/preview/animals/:dogId) kennt sie nicht. Nach Namen sortiert.
export function ownAnimals(dogs) {
  return (Array.isArray(dogs) ? dogs : [])
    .filter((dog) => dog && !dog.shared_from)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'))
}

function optionLabel(dog) {
  const name = dog.name || 'Ohne Namen'
  return dog.public_slug ? name : `${name} (noch nicht veröffentlicht)`
}

// Reiter "Steckbriefe" der Kundensicht (nur Tierheime): Auswahl eines eigenen Tiers, darunter sein
// Steckbrief so, wie Kundinnen und Kunden ihn sehen - auch, solange er noch nicht veröffentlicht ist.
export default function SteckbriefPreview() {
  const [dogs, setDogs] = useState(undefined)
  const [error, setError] = useState(null)
  const [dogId, setDogId] = useState('')

  useEffect(() => {
    let cancelled = false
    api
      .listDogs()
      .then((list) => {
        if (cancelled) return
        const own = ownAnimals(list)
        setDogs(own)
        setDogId(own.length ? String(own[0].id) : '')
      })
      .catch(() => {
        if (!cancelled) setError(LOAD_ERROR)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loadAnimal = useCallback(() => api.partnerArea.previewAnimal(dogId), [dogId])

  if (error) {
    return (
      <div className="error-banner" role="alert">
        {error}
      </div>
    )
  }
  if (dogs === undefined) {
    return (
      <p className="muted" role="status" aria-busy="true">
        Lädt …
      </p>
    )
  }
  if (dogs.length === 0) {
    return <p className="customer-view-empty">Noch keine Tiere angelegt – legt unter „Tiere“ das erste an, dann seht ihr hier seinen Steckbrief.</p>
  }

  const selected = dogs.find((dog) => String(dog.id) === dogId)

  return (
    <div className="customer-view-steckbrief">
      <div className="field customer-view-animal">
        <label className="field-label" htmlFor="customer-view-animal">
          Tier
        </label>
        <select id="customer-view-animal" value={dogId} onChange={(event) => setDogId(event.target.value)}>
          {dogs.map((dog) => (
            <option key={dog.id} value={String(dog.id)}>
              {optionLabel(dog)}
            </option>
          ))}
        </select>
        {selected && !selected.public_slug && (
          <p className="field-hint">Dieser Steckbrief ist noch nicht veröffentlicht – Kundinnen und Kunden sehen ihn erst danach.</p>
        )}
      </div>
      {/* Audit V7a: der Steckbrief ist eine öffentliche Seite wie das Portal - ohne die App-Leiste. */}
      <PreviewFrame label={`Steckbrief von ${selected?.name || 'eurem Tier'} (Vorschau)`} showNav={false}>
        <SteckbriefPage key={dogId} load={loadAnimal} preview />
      </PreviewFrame>
    </div>
  )
}
