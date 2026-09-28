import { useEffect, useState } from 'react'
import { api } from '../api'

const LABELS = {
  staging: 'Vorschau – Beispieldaten, die regelmäßig zurückgesetzt werden',
  dev: 'Testsystem (lokal)'
}

// Band ganz oben, damit niemand die Vorschau oder die lokale Testumgebung mit der echten Chronik verwechselt
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
    <div className={`env-banner env-${appEnv}`} role="note">
      {label}
    </div>
  )
}
