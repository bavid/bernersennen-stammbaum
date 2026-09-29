import Icon from './Icon.jsx'
import { ExternalLink } from './PreviewLink.jsx'
import { googleMapsUrl, osmUrl } from '../lib/format.js'

export function hasCoords(item) {
  return Number.isFinite(item?.lat) && Number.isFinite(item?.lon)
}

// Leise Karten-Links einer Partner- bzw. Ortskarte (PartnerCard, PlaceList): "Google Maps · OpenStreetMap" -
// nur mit Koordinaten. Der Name steht für Screenreader im Link, damit er auch aus der Linkliste heraus eindeutig ist.
export default function MapLinks({ item }) {
  if (!hasCoords(item)) return null
  return (
    <span className="card-map-links">
      <Icon name="mapPin" />
      <ExternalLink className="card-link" href={googleMapsUrl(item)}>
        <span className="visually-hidden">{item.name} in </span>Google Maps
      </ExternalLink>
      <ExternalLink className="card-link" href={osmUrl(item)}>
        <span className="visually-hidden">{item.name} in </span>OpenStreetMap
      </ExternalLink>
    </span>
  )
}
