import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { START_ROUTE, groupRoute } from '../lib/areas.js'

// In einen anderen Bereich wechseln (Familie öffnen, ein befreundetes Zuhause besuchen). Phase W: nur noch navigieren -
// das AreaGate am Ziel (AreaRoutes.jsx) ruft POST /api/view genau einmal und übernimmt das neue "me". Ein eigener
// Wechsel hier liefe dem Gate in die Quere (React-Router navigiert als Transition: dazwischen sähe ein Gate den neuen
// Bereich mit der alten Adresse und wechselte zurück). family: "me" - die Id des eigenen Zuhauses führt nach /start.
export default function useOpenArea(family) {
  const navigate = useNavigate()
  const homeId = family?.home?.id ?? family?.id
  return useCallback((id) => navigate(id === homeId ? START_ROUTE : groupRoute(id)), [navigate, homeId])
}
