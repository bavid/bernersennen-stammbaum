import { useEffect, useState } from 'react'
import NearbySearch from '../components/nearby/NearbySearch.jsx'
import { readSetting, writeSetting } from '../lib/storage.js'

const DEFAULT_RADIUS = 25

// /umgebung für Partner und Tierheime (Phase W, Schritt 2: Haushalte finden dasselbe als Reiter "Karte" in Entdecken -
// AreaRoutes.jsx leitet sie dorthin um): Tierheime, Vermittlungsstellen und Hundeschulen in der Nähe, per PLZ oder
// Standort (components/nearby/NearbySearch.jsx). Merkt sich nur PLZ und Radius fürs nächste Mal - dieselben Schlüssel wie
// Entdecken.
export default function NearbyPage() {
  const [plz, setPlz] = useState(() => readSetting('nearbyPlz', ''))
  const [radius, setRadius] = useState(() => readSetting('nearbyRadius', DEFAULT_RADIUS))

  useEffect(() => {
    writeSetting('nearbyPlz', plz)
  }, [plz])

  useEffect(() => {
    writeSetting('nearbyRadius', radius)
  }, [radius])

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

      <NearbySearch plz={plz} radius={radius} onPlzChange={setPlz} onRadiusChange={setRadius} />
    </div>
  )
}
