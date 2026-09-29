import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import Icon from '../components/Icon.jsx'
import ThemeMark from '../components/ThemeMark.jsx'

// /admin-ansicht/:id (Phase 5 Task 5b), aus der Admin-Liste in einem neuen Tab geöffnet: ruft POST
// /api/admin/view/:id (setzt das normale Sitzungs-Cookie als Nur-Lesen-Sitzung) und übergibt die Antwort -
// sie hat die Form von /me, mit adminView: true - an App.jsx (onEntered), das die Sitzung übernimmt und
// zur Startroute des Bereichs wechselt. Ohne Admin-Sitzung (401) geht es zum Admin-Login, einen
// unbekannten Bereich (404) meldet die Seite.
const MESSAGES = {
  401: 'Bitte zuerst als Admin anmelden.',
  404: 'Diesen Bereich gibt es nicht.'
}

export default function AdminViewStartPage({ familyId, onEntered }) {
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    api.admin
      .viewFamily(familyId)
      .then((me) => {
        if (!cancelled) onEntered(me)
      })
      .catch((err) => {
        if (!cancelled) setError(err)
      })
    return () => {
      cancelled = true
    }
    // onEntered kommt aus App.jsx und ändert sich nicht so, dass ein zweiter Aufruf sinnvoll wäre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId])

  return (
    <div className="admin-login admin-view-start">
      <div className="card form-stack admin-login-card" role={error ? 'alert' : 'status'} aria-busy={!error}>
        <ThemeMark size={56} />
        <div>
          <span className="eyebrow">Admin-Ansicht</span>
          <h1 className="admin-title">{error ? 'Bereich lässt sich nicht öffnen' : 'Bereich wird geöffnet …'}</h1>
        </div>
        {error ? (
          <>
            <p className="error-banner">{MESSAGES[error.status] || error.message}</p>
            <Link to="/admin" className="btn btn-ink btn-lg">
              <Icon name="arrowLeft" /> {error.status === 401 ? 'Zum Admin-Login' : 'Zurück zum Admin'}
            </Link>
          </>
        ) : (
          <p className="muted">Die Sitzung wird nur lesend geöffnet – nichts lässt sich darin ändern.</p>
        )}
      </div>
    </div>
  )
}
