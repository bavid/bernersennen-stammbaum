import { useEffect, useState } from 'react'
import { api } from '../api'
import { useToast } from '../components/Toast.jsx'

// Einstellungen › Wer sieht was › Öffentlich (Phase M): das eigene öffentliche Profil laden und speichern
// (GET/PUT /api/revier/einstellungen, PUT /tiere). onChange meldet jeden neuen Stand an „Wer sieht was“ (Tiere,
// Erinnerungen zeigen ihn mit). error: das Profil gibt es hier nicht (z. B. nicht die Leitung) - dann ein ruhiger Satz.
export default function useRevierEinstellungen(onChange) {
  const toast = useToast()
  const [settings, setSettings] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    api.revier
      .einstellungen()
      .then((data) => active && setSettings(data))
      .catch((err) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [])

  async function run(action) {
    setBusy(true)
    try {
      const next = await action()
      setSettings(next)
      onChange?.(next)
      return true
    } catch (err) {
      toast(err.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const save = (patch) => run(() => api.revier.saveEinstellungen(patch))
  const saveTiere = (ids) => run(() => api.revier.saveTiere(ids))

  return { settings, error, busy, save, saveTiere }
}
