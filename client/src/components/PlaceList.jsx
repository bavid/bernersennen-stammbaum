import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import { TYPE_LABELS, BADGE_LABELS } from '../lib/partnerTypes.js'
import { formatDistanceKm, isExternalUrl, googleMapsUrl, osmUrl } from '../lib/format.js'

const FILTERS = [
  { key: 'alle', label: 'Alle' },
  { key: 'tierheim', label: 'Tierheime' },
  { key: 'hundeschule', label: 'Hundeschulen' }
]

// Tierheim und Vermittlung zählen zusammen als "Tierheime" – der Chip trennt nach Alltagssprache,
// nicht nach der Server-Typenliste (server/db.js partners.typ).
function matchesFilter(place, filter) {
  if (filter === 'alle') return true
  if (filter === 'tierheim') return place.typ === 'tierheim' || place.typ === 'vermittlung'
  return place.typ === filter
}

function hasCoords(place) {
  return Number.isFinite(place.lat) && Number.isFinite(place.lon)
}

function PlaceItem({ place }) {
  const typeLabel = TYPE_LABELS[place.typ] || place.typ
  const isPartner = place.quelle === 'partner'
  const badgeLabel = place.badge ? BADGE_LABELS[place.badge] || place.badge : null

  return (
    <article className="partner-card card place-item">
      <div className="partner-card-head">
        {place.logoUrl ? (
          <img src={place.logoUrl} alt="" className="partner-card-logo" />
        ) : (
          <span className="partner-card-logo partner-card-logo-fallback" aria-hidden="true">
            <Icon name="mapPin" />
          </span>
        )}
        <div className="partner-card-title">
          <h3>{place.name}</h3>
          <p className="partner-card-meta">
            {badgeLabel && <span className={`pill ${place.badge === 'partner' ? 'pill-rust' : ''}`}>{badgeLabel}</span>}
            <span>{typeLabel}</span>
            {typeof place.distanceKm === 'number' && <span className="partner-card-distance">{formatDistanceKm(place.distanceKm)}</span>}
          </p>
          {!isPartner && place.adresse && <p className="place-item-address">{place.adresse}</p>}
        </div>
      </div>
      <div className="partner-card-links">
        {isPartner && place.slug && (
          <Link className="btn btn-ghost" to={`/p/${place.slug}`}>
            Zum Portal
          </Link>
        )}
        {!isPartner && isExternalUrl(place.website) && (
          <a className="btn btn-ghost" href={place.website} target="_blank" rel="noopener noreferrer">
            <Icon name="globe" /> Website
          </a>
        )}
        {!isPartner && place.telefon && (
          <a className="btn btn-ghost" href={`tel:${place.telefon}`}>
            <Icon name="phone" /> {place.telefon}
          </a>
        )}
        {!isPartner && place.email && (
          <a className="btn btn-ghost" href={`mailto:${place.email}`}>
            <Icon name="mail" /> {place.email}
          </a>
        )}
        {hasCoords(place) && (
          <>
            <a className="btn btn-ghost" href={googleMapsUrl(place)} target="_blank" rel="noopener noreferrer">
              In Google Maps öffnen
            </a>
            <a className="btn btn-ghost" href={osmUrl(place)} target="_blank" rel="noopener noreferrer">
              OpenStreetMap
            </a>
          </>
        )}
      </div>
    </article>
  )
}

// Ergebnisliste für "In der Nähe" (client/src/pages/NearbyPage.jsx): Kopf mit Trefferzahl/Umkreis/Ort,
// Filter-Chips (tierheim+vermittlung zählen als "Tierheime"), Karten je Treffer, limited-Hinweis und die
// OSM-Quellenangabe. results kommt unverändert vom Server – Partner stehen bereits vorn (server/lib/places).
export default function PlaceList({ results, radius, ort, limited, attribution }) {
  const [filter, setFilter] = useState('alle')
  const filtered = results.filter((place) => matchesFilter(place, filter))

  return (
    <div className="place-list-wrap">
      <div className="place-list-head">
        <h2>
          {results.length} Treffer im Umkreis von {radius} km um {ort || 'euren Standort'}
        </h2>
        <div className="filter-chips" role="group" aria-label="Nach Art filtern">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`filter-chip ${filter === item.key ? 'filter-chip-active' : ''}`}
              aria-pressed={filter === item.key}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {limited && <p className="place-list-limited-hint">Gerade sind nur gespeicherte Ergebnisse verfügbar – später mehr.</p>}

      {filtered.length === 0 ? (
        <div className="empty-state card">
          <Icon name="mapPin" />
          <h3>Keine Treffer</h3>
          <p className="muted">Versucht es mit einem größeren Umkreis oder einer anderen Auswahl.</p>
        </div>
      ) : (
        <ul className="partner-list place-list">
          {filtered.map((place) => (
            <li key={place.id}>
              <PlaceItem place={place} />
            </li>
          ))}
        </ul>
      )}

      {attribution?.length > 0 && <p className="place-list-attribution">{attribution.join(' · ')}</p>}
    </div>
  )
}
