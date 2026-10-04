import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'

// Rahmen-Links des eigenen Zuhauses (Einstellungen › Mein Zuhause): laden, anlegen ({ geraet, token } - das Token gibt es
// nur in dieser einen Antwort), umbenennen und widerrufen. update nimmt auch eine neue Auswahl (der Server kann es) - die
// Oberfläche bietet bisher nur das Umbenennen; für eine andere Auswahl beendet man den Rahmen und richtet ihn neu ein. Fehler beim Laden stehen in error, Fehler
// beim Ändern werfen die Aktionen (das Formular zeigt sie).
export default function useRahmenGeraete() {
  const [state, setState] = useState({ geraete: null, max: 5, error: null })

  useEffect(() => {
    let cancelled = false
    api
      .rahmenGeraete()
      .then(({ geraete, max }) => {
        if (!cancelled) setState({ geraete, max, error: null })
      })
      .catch((err) => {
        if (!cancelled) setState((current) => ({ ...current, geraete: current.geraete || [], error: err.message }))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const create = useCallback(async (payload) => {
    const result = await api.createRahmenGeraet(payload)
    setState((current) => ({ ...current, geraete: [...(current.geraete || []), result.geraet] }))
    return result
  }, [])

  const update = useCallback(async (id, payload) => {
    const { geraet } = await api.updateRahmenGeraet(id, payload)
    setState((current) => ({ ...current, geraete: current.geraete.map((item) => (item.id === id ? geraet : item)) }))
    return geraet
  }, [])

  const revoke = useCallback(async (id) => {
    await api.revokeRahmenGeraet(id)
    setState((current) => ({ ...current, geraete: current.geraete.filter((item) => item.id !== id) }))
  }, [])

  return { ...state, create, update, revoke }
}
