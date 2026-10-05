import { useCallback, useEffect, useState } from 'react'
import { applyWaitingWorker, registerServiceWorker } from '../lib/pwa.js'

// Meldet den Service Worker einmal an (nur im Produktions-Build, lib/pwa.js) und weiß, ob eine neue Version fertig
// installiert wartet: { updateAvailable, reload }. reload() lässt sie übernehmen und lädt die Seite neu - nur auf Klick
// („Neu laden“ in components/PwaUpdate.jsx), nie von allein mitten in einer Eingabe.
export default function useServiceWorkerUpdate({ register = registerServiceWorker, apply = applyWaitingWorker } = {}) {
  const [waiting, setWaiting] = useState(null)

  useEffect(() => {
    register({ onWaiting: setWaiting })
  }, [register])

  const reload = useCallback(() => apply(waiting), [apply, waiting])
  return { updateAvailable: waiting !== null, reload }
}
