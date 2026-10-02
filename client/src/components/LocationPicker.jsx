import { useEffect, useId, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { roundCoord } from '../lib/geo.js'
import { locationSummary } from '../lib/locationSummary.js'

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

// Phase V1: die eine ruhige Zeile über den Inhalten - "In der Nähe von 20095 Hamburg · 25 km · ändern". Der Knopf
// klappt die Eingabe darunter auf und zu (aria-expanded/aria-controls).
function LocationSummary({ summary, open, formId, toggleRef, onToggle }) {
  return (
    <p className="location-summary">
      <Icon name="mapPin" />
      <span className="location-summary-text">{summary.text}</span>
      {summary.radius !== null && <span className="location-summary-radius">{summary.radius} km</span>}
      <button
        type="button"
        ref={toggleRef}
        className="location-summary-toggle"
        aria-expanded={open}
        aria-controls={open ? formId : undefined}
        onClick={onToggle}
      >
        {open ? 'schließen' : summary.action}
        {(open || summary.action === 'ändern') && <span className="visually-hidden">: Ort und Umkreis</span>}
      </button>
    </p>
  )
}

// PLZ + Umkreis, wahlweise mit „Standort verwenden" (Task 6 schaltet das für die App frei). Reiner
// Formular-Baustein: die aufrufende Seite hält plz/radius als State und ruft bei onSubmit den Server.
// Seit Phase U kompakt: PLZ (ca. 7 Zeichen breit), Umkreis und „Suchen" in einer Zeile, der Standort als
// kleiner Text-Link darunter - auf Entdecken, /partner und /umgebung gleich.
// collapsible (Phase V1): zugeklappt auf eine Zeile (LocationSummary) - applied ist der Ort der letzten erfolgreichen
// Suche, allowEverywhere erlaubt "Überall" (ohne PLZ). Ändert sich applied nach einem Absenden, klappt die Eingabe
// wieder zu (und der Fokus kehrt zum Knopf zurück); scheitert die Suche, bleibt sie offen. Ohne etwas zum
// Zusammenfassen (z. B. /umgebung vor der ersten Suche) bleibt sie offen.
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
  insecureHint,
  collapsible = false,
  applied = null,
  allowEverywhere = false
}) {
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState(null)
  const summary = collapsible ? locationSummary(applied, { allowEverywhere }) : null
  const [open, setOpen] = useState(!summary)
  const formId = useId()
  const toggleRef = useRef(null)
  const formRef = useRef(null)
  const plzRef = useRef(null)
  const awaitingResult = useRef(false)
  const focusPlzOnOpen = useRef(false)
  const showLocateButton = geolocationAvailable(allowGeolocation)
  const showInsecureHint = isInsecureContext(allowGeolocation)
  const showForm = !summary || open

  // Nur ein neues Ergebnis NACH einem Absenden klappt zu - nicht das erste Laden der Seite.
  useEffect(() => {
    if (!awaitingResult.current || !collapsible) return
    awaitingResult.current = false
    if (!locationSummary(applied, { allowEverywhere })) return
    const hadFocus = Boolean(formRef.current?.contains(document.activeElement))
    setOpen(false)
    if (hadFocus) toggleRef.current?.focus()
  }, [applied]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !focusPlzOnOpen.current) return
    focusPlzOnOpen.current = false
    plzRef.current?.focus()
  }, [open])

  function toggle() {
    focusPlzOnOpen.current = !open
    setOpen((current) => !current)
  }

  // onSubmit gibt false zurück, wenn die Seite gar nicht sucht (z. B. unvollständige PLZ) - dann wartet nichts auf ein
  // Ergebnis, und eine spät eintreffende ältere Antwort klappt die Eingabe nicht zu.
  function handleSubmit(event) {
    awaitingResult.current = onSubmit(event) !== false
  }

  function handlePlzChange(value) {
    onPlzChange(value.replace(/\D/g, '').slice(0, PLZ_LENGTH))
  }

  function handleLocate() {
    setLocateError(null)
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        awaitingResult.current = true
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

  const form = (
    // noValidate: die eigene JS-Prüfung (PartnersPage/NearbyPage) übernimmt die Meldung bei
    // unvollständiger PLZ - ohne noValidate blockiert das pattern="[0-9]{5}" unten die Übermittlung
    // schon nativ (stiller Blick, kein eigener Text) und unser onSubmit läuft nie (Finding 10).
    <form className="location-picker" id={formId} ref={formRef} onSubmit={handleSubmit} noValidate>
      <div className="location-picker-fields">
        <div className="field location-picker-plz">
          <label className="field-label" htmlFor="location-plz">
            Postleitzahl
          </label>
          <input
            id="location-plz"
            ref={plzRef}
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

  if (!collapsible) return form
  return (
    <div className={`location-picker-box${showForm ? ' is-open' : ''}`}>
      {summary && <LocationSummary summary={summary} open={open} formId={formId} toggleRef={toggleRef} onToggle={toggle} />}
      {showForm && form}
    </div>
  )
}
