import { useEffect, useState } from 'react'
import { api } from '../api'
import LocationPicker from '../components/LocationPicker.jsx'
import PlaceList from '../components/PlaceList.jsx'
import Icon from '../components/Icon.jsx'
import { readSetting, writeSetting } from '../lib/storage.js'

const DEFAULT_RADIUS = 25
const PLZ_LENGTH = 5
const GEO_PRIVACY_HINT = 'Dein Standort wird auf etwa 1 km gerundet, nur für diese Suche verwendet und nicht gespeichert.'
const INSECURE_HINT = 'Standort geht nur über eine sichere Verbindung – nutzt die PLZ.'
const INCOMPLETE_PLZ_ERROR = 'Bitte eine 5-stellige Postleitzahl eingeben.'

// /umgebung (angemeldet, auch in der Demo): Tierheime, Vermittlungsstellen und Hundeschulen in der Nähe,
// per PLZ oder Standort. Merkt sich nur PLZ und Radius fürs nächste Mal (readSetting/writeSetting) –
// nie Koordinaten, die kommen ausschließlich als Parameter von LocationPicker.onLocate herein.
export default function NearbyPage() {
  const [plz, setPlz] = useState(() => readSetting('nearbyPlz', ''))
  const [radius, setRadius] = useState(() => readSetting('nearbyRadius', DEFAULT_RADIUS))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  // Phase V1: dezente Ortswahl - mit gemerkter PLZ gleich "In der Nähe von 20095 · ändern", ohne bleibt die Eingabe
  // offen (hier gibt es kein "überall"). Jede erfolgreiche Suche setzt den Ort neu (samt Ortsnamen).
  const [applied, setApplied] = useState(() => (plz.length === PLZ_LENGTH ? { plz, radius } : null))

  useEffect(() => {
    writeSetting('nearbyPlz', plz)
  }, [plz])

  useEffect(() => {
    writeSetting('nearbyRadius', radius)
  }, [radius])

  useEffect(() => {
    if (plz.length === PLZ_LENGTH) search({ plz })
    // Nur beim ersten Laden – die Suche danach löst ausschließlich Formular oder Standort-Knopf aus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function search(location) {
    setLoading(true)
    setError(null)
    try {
      const result = await api.searchPlaces(location, radius)
      setData(result)
      setApplied(location.plz ? { plz: location.plz, ort: result?.center?.ort || null, radius } : { standort: true, radius })
    } catch (err) {
      setError(err.message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (plz.length !== PLZ_LENGTH) {
      setError(INCOMPLETE_PLZ_ERROR)
      setData(null)
      return false
    }
    search({ plz })
    return true
  }

  function handleLocate({ lat, lon }) {
    search({ lat, lon })
  }

  return (
    <div className="page nearby-page">
      <header className="page-hero">
        <div>
          <span className="eyebrow">In der Nähe</span>
          <h1>Tierheime & Hundeschulen</h1>
          <p className="page-lede">
            Findet Tierheime, Vermittlungsstellen und Hundeschulen in eurer Nähe – über OpenStreetMap, per Postleitzahl oder
            eurem Standort.
          </p>
        </div>
      </header>

      <LocationPicker
        plz={plz}
        radius={radius}
        onPlzChange={setPlz}
        onRadiusChange={setRadius}
        onSubmit={handleSubmit}
        onLocate={handleLocate}
        allowGeolocation
        geoHint={GEO_PRIVACY_HINT}
        insecureHint={INSECURE_HINT}
        collapsible
        applied={applied}
      />

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {loading && (
        <p className="muted" aria-busy="true">
          Sucht …
        </p>
      )}

      {!loading && data && (
        <PlaceList
          results={data.results}
          radius={data.radius}
          ort={data.center?.ort}
          limited={data.limited}
          attribution={data.attribution}
        />
      )}

      {!loading && !data && !error && (
        <div className="empty-state card">
          <Icon name="mapPin" />
          <h3>Noch keine Suche</h3>
          <p className="muted">Gebt eine Postleitzahl ein oder nutzt euren Standort, um loszulegen.</p>
        </div>
      )}
    </div>
  )
}
