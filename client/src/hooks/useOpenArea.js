import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { startRoute } from '../lib/areas.js'
import { useToast } from '../components/Toast.jsx'

// In einen anderen Bereich wechseln (Familie öffnen, ein befreundetes Zuhause besuchen): POST /api/view prüft die
// Berechtigung, danach gilt das neue "me" und es geht zur Startseite des Bereichs. Fehler kommen als Hinweis. Phase W:
// ohne eigenen Hinweis "Du bist jetzt in …" - der Kopf der Seite zeigt ohnehin, wo man ist (AreaGate schaltet beim
// Navigieren meist von selbst um).
export default function useOpenArea(onFamilyChange) {
  const navigate = useNavigate()
  const toast = useToast()
  return useCallback(
    async (id) => {
      try {
        const me = await api.view(id)
        onFamilyChange(me)
        navigate(startRoute(me))
      } catch (err) {
        toast(err.message)
      }
    },
    [onFamilyChange, navigate, toast]
  )
}
