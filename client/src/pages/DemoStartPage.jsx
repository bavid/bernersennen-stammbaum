import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import Icon from '../components/Icon.jsx'
import ThemeMark from '../components/ThemeMark.jsx'
import { parseDemoStart } from '../lib/present.js'
import { t } from '../lib/i18n/index.js'

// /demo-start?as=…&slug=…&ziel=… (Phase 5 Task 5): der Einstieg hinter jeder Kachel des Präsentationsmodus
// (AdminPresentPage), in einem neuen Tab geöffnet. Ruft POST /api/demo mit den Argumenten aus der Adresse
// (lib/present.js parseDemoStart - unbekannte Werte gehen gar nicht erst zum Server) und übergibt die Antwort
// (Form von /me) an App.jsx (onEntered), das die Sitzung übernimmt und zur Startroute des Bereichs bzw. zum
// Ziel (/kundensicht) wechselt. Öffentlich wie POST /api/demo selbst.
const INVALID_TARGET = 'Diese Demo gibt es nicht – bitte über den Präsentationsmodus öffnen.'
const MESSAGES = {
  404: 'Diese Demo ist gerade nicht verfügbar.'
}

export default function DemoStartPage({ search, onEntered }) {
  const target = parseDemoStart(search)
  const [error, setError] = useState(target ? null : { message: INVALID_TARGET })

  useEffect(() => {
    if (!target) return undefined
    let cancelled = false
    api
      .demo(target.demoArgs)
      .then((me) => {
        if (!cancelled) onEntered(me, target.route)
      })
      .catch((err) => {
        if (!cancelled) setError(err)
      })
    return () => {
      cancelled = true
    }
    // target folgt aus search; onEntered kommt aus App.jsx und ändert sich nicht so, dass ein zweiter Aufruf
    // sinnvoll wäre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  return (
    <div className="admin-login demo-start">
      <div className="card form-stack admin-login-card" role={error ? 'alert' : 'status'} aria-busy={!error}>
        <ThemeMark size={56} />
        <div>
          <span className="eyebrow">Demo</span>
          <h1 className="admin-title">{error ? t('Demo lässt sich nicht öffnen') : t('Demo wird geöffnet …')}</h1>
        </div>
        {error ? (
          <>
            <p className="error-banner">{MESSAGES[error.status] ? t(MESSAGES[error.status]) : t(error.message)}</p>
            <Link to="/" className="btn btn-ink btn-lg">
              <Icon name="arrowLeft" /> {t('Zur Startseite')}
            </Link>
          </>
        ) : (
          <p className="muted">{t('Ohne Anmeldung, schreibgeschützt – nichts lässt sich darin ändern.')}</p>
        )}
      </div>
    </div>
  )
}
