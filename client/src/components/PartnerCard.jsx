import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import { TYPE_LABELS, BADGE_LABELS } from '../lib/partnerTypes.js'
import { formatDistanceKm, isExternalUrl } from '../lib/format.js'

function hasCoords(partner) {
  return Number.isFinite(partner.lat) && Number.isFinite(partner.lon)
}

// Google/OSM erwarten nur die reinen Zahlen in der Adresse – lat/lon kommen bereits geprüft vom Server
// (server/lib/geo.js validCoords), hier trotzdem nur Number.isFinite-Werte verwenden.
function googleMapsUrl({ lat, lon }) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`
}

function osmUrl({ lat, lon }) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`
}

// Eine Karte in der Partnerliste (/partner): Logo, Name, Typ, Entfernung, Badge und Links zum Portal,
// zur Website und zu Google Maps/OpenStreetMap.
export default function PartnerCard({ partner }) {
  const typeLabel = TYPE_LABELS[partner.typ] || partner.typ
  const badgeLabel = BADGE_LABELS[partner.badge] || partner.badge

  return (
    <article className="partner-card card">
      <div className="partner-card-head">
        {partner.logoUrl ? (
          <img src={partner.logoUrl} alt="" className="partner-card-logo" />
        ) : (
          <span className="partner-card-logo partner-card-logo-fallback" aria-hidden="true">
            <Icon name="mapPin" />
          </span>
        )}
        <div className="partner-card-title">
          <h3>{partner.name}</h3>
          <p className="partner-card-meta">
            <span className={`pill ${partner.badge === 'partner' ? 'pill-rust' : ''}`}>{badgeLabel}</span>
            <span>{typeLabel}</span>
            {partner.plz && partner.ort && (
              <span>
                {partner.plz} {partner.ort}
              </span>
            )}
            {typeof partner.distanceKm === 'number' && <span className="partner-card-distance">{formatDistanceKm(partner.distanceKm)}</span>}
          </p>
        </div>
      </div>
      <div className="partner-card-links">
        <Link className="btn btn-ghost" to={`/p/${partner.slug}`}>
          Zum Portal
        </Link>
        {isExternalUrl(partner.website) && (
          <a className="btn btn-ghost" href={partner.website} target="_blank" rel="noopener noreferrer">
            <Icon name="globe" /> Website
          </a>
        )}
        {hasCoords(partner) && (
          <>
            <a className="btn btn-ghost" href={googleMapsUrl(partner)} target="_blank" rel="noopener noreferrer">
              In Google Maps öffnen
            </a>
            <a className="btn btn-ghost" href={osmUrl(partner)} target="_blank" rel="noopener noreferrer">
              OpenStreetMap
            </a>
          </>
        )}
      </div>
    </article>
  )
}
