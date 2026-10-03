import { useEffect, useState } from 'react'
import { api } from '../api'

// Kurzes Etikett am rechten Ende der Linie, der ganze Satz für Screenreader und als Tooltip.
const LABELS = {
  staging: { short: 'Vorschau', long: 'Vorschau – Beispieldaten, die regelmäßig zurückgesetzt werden' },
  dev: { short: 'Testsystem', long: 'Testsystem (lokal)' }
}

// Ganz oben, damit niemand die Vorschau oder die lokale Testumgebung mit der echten Chronik verwechselt (TopStrip):
// seit der Calm-down-Runde nur noch eine 3 px hohe farbige Linie mit einem winzigen Etikett rechts - kein Band mehr,
// das Platz kostet (das Etikett hängt über die Zeile darunter, ohne Klicks abzufangen).
export default function EnvBanner() {
  const [appEnv, setAppEnv] = useState(null)

  useEffect(() => {
    let active = true
    api
      .config()
      .then((config) => active && setAppEnv(config.appEnv))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const label = LABELS[appEnv]
  if (!label) return null
  return (
    <div className={`env-banner env-${appEnv}`} role="note" title={label.long}>
      <span className="env-banner-label" aria-hidden="true">
        {label.short}
      </span>
      <span className="visually-hidden">{label.long}</span>
    </div>
  )
}
