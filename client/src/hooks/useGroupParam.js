import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { GROUP_PARAM } from '../lib/familyGroups.js'

// Gewählte Gruppe eines Tier-Rasters in der Adresse (?gruppe=…; Familienbande des Tierheims und Raster „Alle“ der Tiere) -
// [gewünschter Wert oder null, select(param | null)]. Jede Wahl ist ein Eintrag im Verlauf (Zurück hebt sie wieder auf); ein
// Klick auf die schon gewählte Gruppe legt keinen zweiten gleichen an.
export default function useGroupParam() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get(GROUP_PARAM)

  const select = useCallback(
    (param) => {
      if (param === requested) return
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        if (param) next.set(GROUP_PARAM, param)
        else next.delete(GROUP_PARAM)
        return next
      })
    },
    [requested, setSearchParams]
  )

  return [requested, select]
}
