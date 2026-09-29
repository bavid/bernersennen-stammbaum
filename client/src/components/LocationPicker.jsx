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

// Wird der Standort-Knopf angeboten (allowGeolocation), aber die Verbindung ist nicht sicher, erklärt
// insecureHint (siehe unten) den Grund statt den Knopf einfach kommentarlos wegzulassen.
function isInsecureContext(allowGeolocation) {
  return Boolean(allowGeolocation) && typeof window !== 'undefined' && !window.isSecureContext
}

// PLZ + Umkreis, wahlweise mit „Standort verwenden" (Task 6 schaltet das für die App frei). Reiner
// Formular-Baustein: die aufrufende Seite hält plz/radius als State und ruft bei onSubmit den Server.
// Seit Phase U kompakt: PLZ (ca. 7 Zeichen breit), Umkreis und „Suchen" in einer Zeile, der Standort als
// kleiner Text-Link darunter - auf Entdecken, /partner und /umgebung gleich.
export default function LocationPicker({
  plz,
  radius,
  onPlzChange,
  onRadiusChange,
  onSubmit,
  onLocate,
  allowGeolocation = false,
  hint,
  geoHint,
  insecureHint
}) {
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState(null)
  const showLocateButton = geolocationAvailable(allowGeolocation)
  const showInsecureHint = isInsecureContext(allowGeolocation)

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
    // noValidate: die eigene JS-Prüfung (PartnersPage/NearbyPage) übernimmt die Meldung bei
    // unvollständiger PLZ - ohne noValidate blockiert das pattern="[0-9]{5}" unten die Übermittlung
    // schon nativ (stiller Blick, kein eigener Text) und unser onSubmit läuft nie (Finding 10).
    <form className="location-picker" onSubmit={onSubmit} noValidate>
      <div className="location-picker-fields">
        <div className="field location-picker-plz">
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
            placeholder="10115"
            autoComplete="postal-code"
          />
        </div>
        <div className="field location-picker-radius">
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
        <>
          <button type="button" className="location-picker-locate" onClick={handleLocate} disabled={locating}>
            <Icon name="locate" />
            {locating ? 'Ermittle Standort …' : 'Standort verwenden'}
          </button>
          {geoHint && <p className="field-hint location-picker-privacy">{geoHint}</p>}
        </>
      )}
      {locateError && (
        <p className="field-error" role="alert">
          {locateError}
        </p>
      )}
      {showInsecureHint && insecureHint && <p className="field-hint">{insecureHint}</p>}
      {hint && <p className="field-hint">{hint}</p>}
    </form>
  )
}
