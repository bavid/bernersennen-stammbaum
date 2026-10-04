import { useEffect, useState } from 'react'
import { api } from '../api'
import useBreedingEvents from './useBreedingEvents.js'

// Phase W: die Tiere des aktiven Bereichs für Tiere-Seite und Gruppenseite - eigene und hierher geteilte (dogs), alle
// sichtbaren samt Eltern (allDogs), Mitbewohner-Verbindungen (links) und Verpaarungen (events, für Stammbaum und
// Nachwuchs). dogs null: lädt noch. Scheitert das Laden, steht die Meldung in error.
export default function useAreaAnimals() {
  const [state, setState] = useState({ dogs: null, allDogs: [], links: [], error: null })
  const events = useBreedingEvents(true)

  useEffect(() => {
    let cancelled = false
    // Promise.resolve().then: auch ein Fehler beim Aufruf selbst landet im catch, statt den Effekt abzubrechen.
    Promise.resolve()
      .then(() => Promise.all([api.listDogs(), api.listAllDogs(), api.listLinks()]))
      .then(([dogs, allDogs, links]) => {
        if (!cancelled) setState({ dogs, allDogs, links, error: null })
      })
      .catch((err) => {
        if (!cancelled) setState((current) => ({ ...current, error: err.message }))
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { ...state, events }
}
