import { useState } from 'react'
import { api } from '../../../api'
import { roundCoord } from '../../../lib/geo.js'
import { readSetting, removeSetting, writeSetting } from '../../../lib/storage.js'

export const STANDORT_KEY = 'standortGemerkt'
const NEARBY_PLZ_KEY = 'nearbyPlz'
const LOCATE_TIMEOUT_MS = 10_000
const LOCATE_MAX_AGE_MS = 5 * 60 * 1000
const PERMISSION_DENIED = 1

// Standort einmal abfragen - nur auf Tippen, gerundet auf ~1 km (lib/geo.js roundCoord), nie roh weitergegeben.
function defaultLocate() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject(new Error('Dieser Browser kennt keinen Standort.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: roundCoord(position.coords.latitude), lon: roundCoord(position.coords.longitude) }),
      (err) =>
        reject(
          new Error(
            err.code === PERMISSION_DENIED
              ? 'Vom Browser blockiert – in den Seiteneinstellungen des Browsers wieder erlauben.'
              : 'Der Standort ließ sich gerade nicht bestimmen.'
          )
        ),
      { timeout: LOCATE_TIMEOUT_MS, maximumAge: LOCATE_MAX_AGE_MS }
    )
  })
}

// „Standort für ‚In der Nähe‘ merken“ (Einstellungen › App): fragt den Standort einmal ab, lässt den Server die nächste
// Postleitzahl nennen (POST /api/places/plz, Koordinaten gerundet, nichts wird dort gespeichert) und merkt sich NUR die
// PLZ - auf diesem Gerät (localStorage), in derselben Einstellung, mit der Entdecken und „In der Nähe“ starten
// (DiscoverPage nearbyPlz). Ehrlich beschriftet; „Vergessen“ nimmt beides wieder weg.
export default function StandortSchalter({ locate = defaultLocate }) {
  const [gemerkt, setGemerkt] = useState(() => readSetting(STANDORT_KEY, null))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function merken() {
    setBusy(true)
    setError(null)
    try {
      const { lat, lon } = await locate()
      const hit = await api.plzFromLocation({ lat, lon })
      const next = { plz: hit.plz, ort: hit.ort, at: Date.now() }
      writeSetting(STANDORT_KEY, next)
      writeSetting(NEARBY_PLZ_KEY, hit.plz)
      setGemerkt(next)
    } catch (err) {
      setError(err.message || 'Das hat gerade nicht geklappt.')
    } finally {
      setBusy(false)
    }
  }

  function vergessen() {
    removeSetting(STANDORT_KEY)
    removeSetting(NEARBY_PLZ_KEY)
    setGemerkt(null)
    setError(null)
  }

  return (
    <div className="app-setting">
      <div className="app-setting-row">
        <span className="app-setting-label" id="standort-label">
          Standort für „In der Nähe“ merken
        </span>
        {gemerkt ? (
          <button type="button" className="btn btn-ghost" onClick={vergessen} aria-describedby="standort-hint">
            Vergessen
          </button>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={merken} disabled={busy} aria-describedby="standort-hint">
            {busy ? 'Fragt …' : 'Standort einmal abfragen'}
          </button>
        )}
      </div>
      <p id="standort-hint" className="app-setting-hint muted">
        {gemerkt ? `Gemerkt: ${gemerkt.plz} ${gemerkt.ort}` : 'Noch nichts gemerkt.'}
      </p>
      <p className="app-setting-text">
        Wir fragen den Standort nur auf Tippen ab und merken uns allein die Postleitzahl – auf diesem Gerät, nicht auf dem
        Server. Entdecken und „In der Nähe“ starten dann dort.
      </p>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
    </div>
  )
}
