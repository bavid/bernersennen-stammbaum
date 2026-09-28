import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import LocationPicker from '../components/LocationPicker.jsx'
import { BegleiterSection, FutterSection, HundeschulenSection, SupportSection } from '../components/DiscoverSections.jsx'
import { normalizeDiscover } from '../lib/discover.js'
import { readSetting, writeSetting } from '../lib/storage.js'

const DEFAULT_RADIUS = 25
const RADIUS_VALUES = [5, 10, 25, 50, 100]
const PLZ_LENGTH = 5
const PLZ_RE = /^\d{0,5}$/
const INCOMPLETE_PLZ_ERROR = 'Bitte eine 5-stellige Postleitzahl eingeben.'
const LOAD_ERROR = 'Entdecken konnte gerade nicht geladen werden. Bitte versucht es gleich noch einmal.'
const PLZ_HINT = 'Ohne Postleitzahl zeigen wir alles, nach Namen sortiert.'

// Gemerkte Werte teilt sich die Seite mit "In der Nähe" (/umgebung, NearbyPage) - dieselben Schlüssel,
// damit eine dort eingegebene PLZ hier gleich gilt und umgekehrt. Nur PLZ und Radius, nie Koordinaten.
function storedPlz() {
  const value = readSetting('nearbyPlz', '')
  return typeof value === 'string' && PLZ_RE.test(value) ? value : ''
}

function storedRadius() {
  const value = readSetting('nearbyRadius', DEFAULT_RADIUS)
  return RADIUS_VALUES.includes(value) ? value : DEFAULT_RADIUS
}

// Server-Meldungen (z. B. "Diese Postleitzahl kennen wir nicht", Rate-Limit, keine Verbindung) sind
// schon freundlich formuliert; Serverfehler und nackte "Fehler 500" ersetzt ein eigener Satz.
function friendlyError(err) {
  const message = err?.message
  if (!message || err.status >= 500 || /^Fehler \d+$/.test(message)) return LOAD_ERROR
  return message
}

// /entdecken (angemeldet, auch in der Demo): Hundeschulen, neue Begleiter aus Tierheimen und
// Vermittlungsstellen, Futter-Empfehlungen und Unterstützen - alles aus einer Antwort von POST
// /api/discover. Mit PLZ sortiert der Server nach Entfernung, ohne liefert er alles nach Namen.
export default function DiscoverPage() {
  const [plz, setPlz] = useState(storedPlz)
  const [radius, setRadius] = useState(storedRadius)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Nur die Antwort der jüngsten Anfrage zählt - eine langsame ältere überschreibt nie eine neuere.
  const latestRequest = useRef(0)

  useEffect(() => {
    writeSetting('nearbyPlz', plz)
  }, [plz])

  useEffect(() => {
    writeSetting('nearbyRadius', radius)
  }, [radius])

  // Absichtlich nur beim ersten Anzeigen (leere Abhängigkeitsliste): mit der gemerkten PLZ laden. Danach
  // sucht ausschließlich das Formular - Tippen in PLZ oder Umkreis löst keine Anfrage aus. Das
  // Aufräumen erklärt jede noch laufende Antwort für veraltet, damit sie nach dem Verlassen nichts setzt.
  useEffect(() => {
    load(plz.length === PLZ_LENGTH ? plz : '')
    return () => {
      latestRequest.current += 1
    }
  }, [])

  async function load(searchPlz) {
    latestRequest.current += 1
    const requestId = latestRequest.current
    const isCurrent = () => requestId === latestRequest.current
    setLoading(true)
    setError(null)
    try {
      const result = await api.discover(searchPlz ? { plz: searchPlz, radius } : {})
      if (isCurrent()) setData(normalizeDiscover(result))
    } catch (err) {
      if (!isCurrent()) return
      setError(friendlyError(err))
      setData(null)
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    // Eine angefangene PLZ gilt nicht stillschweigend als "keine PLZ" (wie PartnersPage).
    if (plz.length > 0 && plz.length < PLZ_LENGTH) {
      setError(INCOMPLETE_PLZ_ERROR)
      return
    }
    load(plz)
  }

  return (
    <div className="page discover-page">
      <header className="page-hero">
        <div>
          <span className="eyebrow">Rund ums Tier</span>
          <h1>Entdecken</h1>
          <p className="page-lede">
            Hundeschulen, neue Begleiter aus Tierheimen, Futter-Empfehlungen und Wege, Tieren zu helfen – mit Postleitzahl
            zuerst das, was in eurer Nähe ist.
          </p>
        </div>
      </header>

      <LocationPicker plz={plz} radius={radius} onPlzChange={setPlz} onRadiusChange={setRadius} onSubmit={handleSubmit} hint={PLZ_HINT} />

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {loading && (
        <p className="muted" role="status" aria-busy="true">
          Lädt …
        </p>
      )}

      {data && (
        <div className="discover-chapters" aria-busy={loading || undefined}>
          <HundeschulenSection partner={data.hundeschulPartner} promotions={data.hundeschulPromotions} fallback={data.fallback.hundeschulen} />
          <BegleiterSection
            partner={data.begleiterPartner}
            tiere={data.begleiterTiere}
            promotions={data.begleiterPromotions}
            fallback={data.fallback.begleiter}
          />
          <FutterSection futter={data.futter} />
          <SupportSection support={data.unterstuetzen} />
        </div>
      )}
    </div>
  )
}
