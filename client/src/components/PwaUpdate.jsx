import Icon from './Icon.jsx'
import useServiceWorkerUpdate from '../hooks/useServiceWorkerUpdate.js'

// „Neue Version verfügbar · Neu laden“ - der kleine Hinweis unten, sobald der Service Worker eine neue Version der App
// fertig installiert hat (hooks/useServiceWorkerUpdate.js). Er bleibt stehen, bis jemand neu lädt; niemand verliert
// eine halb geschriebene Erinnerung durch ein Neuladen von allein. In main.jsx eingehängt, über jeder Seite.
export default function PwaUpdate({ register, apply }) {
  const { updateAvailable, reload } = useServiceWorkerUpdate({ register, apply })
  if (!updateAvailable) return null
  return (
    <div className="toast toast-update" role="status">
      <Icon name="sprout" />
      <span>Neue Version verfügbar</span>
      <button type="button" className="toast-action" onClick={reload}>
        Neu laden
      </button>
    </div>
  )
}
