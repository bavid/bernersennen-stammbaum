import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { parseAreaId } from '../lib/areas.js'
import { useToast } from './Toast.jsx'
import RouteFallback from './RouteFallback.jsx'
import { t } from '../lib/i18n/index.js'

// Wohin es geht, wenn ein Bereich nicht (mehr) zu öffnen ist: die Liste der Familien und befreundeten Zuhause.
export const AREA_FALLBACK_ROUTE = '/familien'
const NOT_FOUND = 'Diesen Bereich gibt es nicht'
const FAILED = 'Das hat nicht geklappt – bitte lade die Seite neu.'

// need: 'home' (das eigene Zuhause; ein klassischer Rudel-Login ist sein eigenes Zuhause) oder eine Bereichs-Id aus der
// Adresse (Zahl oder Ziffernfolge). null: ungültige Angabe.
export function targetAreaId(family, need) {
  if (need === 'home') return family.home?.id ?? family.id
  return parseAreaId(need)
}

// Phase W: eine Route sagt, in welchem Bereich sie spielt (AreaRoutes.jsx). Ist gerade ein anderer aktiv, wechselt das
// Gate selbst - genau ein POST /api/view je Ziel (auch unter StrictMode), solange zeigt es den Platzhalter. Das neue
// "me" geht an onFamilyChange (App.jsx setFamily), <main key={family.id}> mountet die Seite dann im neuen Bereich neu.
// Klappt es nicht (kein Zugang mehr, Netz weg) oder meldet der Server einen anderen Bereich: ein Hinweis und weiter zur
// Familien-Liste - nie ein zweiter Versuch derselben Instanz, also keine Schleife.
export default function AreaGate({ family, need, onFamilyChange, children }) {
  const target = targetAreaId(family, need)
  const satisfied = target !== null && target === family.id
  const navigate = useNavigate()
  const toast = useToast()
  const attempted = useRef(null)
  const mounted = useRef(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (satisfied) return
    if (target === null) {
      navigate(AREA_FALLBACK_ROUTE, { replace: true })
      return
    }
    if (attempted.current === target) return
    attempted.current = target
    api
      .view(target)
      .then((me) => {
        if (me?.id !== target) throw new Error(t(NOT_FOUND))
        onFamilyChange(me)
      })
      .catch((err) => {
        if (!mounted.current) return
        setFailed(true)
        toast(err?.message || t(NOT_FOUND))
        // Scheitert schon der Weg nach Hause, hilft die Familien-Liste nicht (sie spielt selbst dort) - dann nur der Hinweis.
        if (need !== 'home') navigate(AREA_FALLBACK_ROUTE, { replace: true })
      })
  }, [satisfied, target, need, navigate, onFamilyChange, toast])

  if (satisfied) return children
  if (failed) {
    return (
      <div className="page">
        <div className="error-banner" role="alert">
          {t(FAILED)}
        </div>
      </div>
    )
  }
  return <RouteFallback />
}
