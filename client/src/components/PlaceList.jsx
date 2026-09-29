import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import MapLinks from './MapLinks.jsx'
import PartnerMark from './PartnerMark.jsx'
import { TYPE_LABELS } from '../lib/partnerTypes.js'
import { formatDistanceKm, isExternalUrl, isOsmAttribution, OSM_COPYRIGHT_URL, GEONAMES_ATTRIBUTION } from '../lib/format.js'

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

function PlaceItem({ place }) {
  const typeLabel = TYPE_LABELS[place.typ] || place.typ
  const isPartner = place.quelle === 'partner'

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
            <PartnerMark badge={place.badge} />
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
          <a className="card-link" href={place.website} target="_blank" rel="noopener noreferrer">
            <Icon name="globe" /> Website
          </a>
        )}
        {!isPartner && place.telefon && (
          <a className="card-link" href={`tel:${place.telefon}`}>
            <Icon name="phone" /> {place.telefon}
          </a>
        )}
        {!isPartner && place.email && (
          <a className="card-link" href={`mailto:${place.email}`}>
            <Icon name="mail" /> {place.email}
          </a>
        )}
        <MapLinks item={place} />
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

      {attribution?.length > 0 && (
        <p className="place-list-attribution">
          {attribution.map((entry, index) => (
            <span key={entry}>
              {index > 0 && ' · '}
              {isOsmAttribution(entry) ? (
                <a href={OSM_COPYRIGHT_URL} target="_blank" rel="noopener noreferrer">
                  {entry}
                </a>
              ) : (
                entry
              )}
            </span>
          ))}
          {' · '}
          {GEONAMES_ATTRIBUTION}
        </p>
      )}
    </div>
  )
}
