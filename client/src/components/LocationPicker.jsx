import { useState } from 'react'
import Icon from './Icon.jsx'
import { roundCoord } from '../lib/geo.js'

const RADIUS_OPTIONS = [5, 10, 25, 50, 100]
const PLZ_LENGTH = 5

// Der Standort-Knopf ist absichtlich nur eine Möglichkeit: er erscheint nur mit allowGeolocation=true
// (für Gäste auf /partner in dieser Phase immer false – siehe Task 6 „In der Nähe") und nur in einem
// sicheren Kontext (HTTPS/localhost) mit vorhandener Geolocation-API.
function geolocationAvailable(allowGeolocation) {
  return Boolean(allowGeolocation) && typeof window !== 'undefined' && window.isSecureContext && 'geolocation' in navigator
}

// PLZ + Umkreis, wahlweise mit „Standort verwenden" (Task 6 schaltet das für die App frei). Reiner
// Formular-Baustein: die aufrufende Seite hält plz/radius als State und ruft bei onSubmit den Server.
export default function LocationPicker({
  plz,
  radius,
  onPlzChange,
  onRadiusChange,
  onSubmit,
  onLocate,
  allowGeolocation = false,
  hint
}) {
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState(null)
  const showLocateButton = geolocationAvailable(allowGeolocation)

  function handlePlzChange(value) {
    onPlzChange(value.replace(/\D/g, '').slice(0, PLZ_LENGTH))
  }

  function handleLocate() {
    setLocateError(null)
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        // Nie genauer als ~1 km weitergeben – siehe server/lib/geo.js roundCoord (dieselbe Rundung).
        onLocate?.({
          lat: roundCoord(position.coords.latitude),
          lon: roundCoord(position.coords.longitude)
        })
      },
      () => {
        setLocating(false)
        setLocateError('Standort konnte nicht ermittelt werden.')
      },
      { enableHighAccuracy: false, timeout: 10000 }
    )
  }

  return (
    <form className="location-picker" onSubmit={onSubmit}>
      <div className="location-picker-fields">
        <div className="field">
          <label className="field-label" htmlFor="location-plz">
            Postleitzahl
          </label>
          <input
            id="location-plz"
            value={plz}
            onChange={(e) => handlePlzChange(e.target.value)}
            inputMode="numeric"
            pattern="[0-9]{5}"
            maxLength={PLZ_LENGTH}
            placeholder="z. B. 10115"
            autoComplete="postal-code"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="location-radius">
            Umkreis
          </label>
          <select id="location-radius" value={radius} onChange={(e) => onRadiusChange(Number(e.target.value))}>
            {RADIUS_OPTIONS.map((km) => (
              <option key={km} value={km}>
                {km} km
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-primary">
          Suchen
        </button>
      </div>
      {showLocateButton && (
        <button type="button" className="btn btn-ghost location-picker-locate" onClick={handleLocate} disabled={locating}>
          <Icon name="locate" />
          {locating ? 'Ermittle Standort …' : 'Standort verwenden'}
        </button>
      )}
      {locateError && (
        <p className="field-error" role="alert">
          {locateError}
        </p>
      )}
      {hint && <p className="field-hint">{hint}</p>}
    </form>
  )
}
