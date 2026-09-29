import Icon from './Icon.jsx'
import { ExternalLink, InternalLink } from './PreviewLink.jsx'
import { TYPE_LABELS, BADGE_LABELS } from '../lib/partnerTypes.js'
import { formatDistanceKm, isExternalUrl, googleMapsUrl, osmUrl } from '../lib/format.js'
import { isAllowedMedia, isClickUrl } from '../lib/discover.js'
import { useIsPreview } from '../lib/preview.js'

const TEASER_SIZE = 72

// Im Reiter "Entdecken" liefert der Server die Website als clickUrl (/r/partner-website/:id, anonyme
// Klickzählung) statt roh in website - dann führt der Link darüber, sonst wie bisher direkt.
function websiteHref(partner) {
  if (isClickUrl(partner.clickUrl)) return partner.clickUrl
  return isExternalUrl(partner.website) ? partner.website : null
}

function hasCoords(partner) {
  return Number.isFinite(partner.lat) && Number.isFinite(partner.lon)
}

// Eine Karte in der Partnerliste (/partner): Logo, Name, Typ, Entfernung, Badge und Links zum Portal,
// zur Website und zu Google Maps/OpenStreetMap. teaserFoto (Phase P1): das neueste Einblick-Foto als
// kleines Vorschaubild - nur öffentliche Fotos, in der Kundensicht auch die eigenen über /uploads.
// Dort bekommt die eigene Karte (vorschau: true) zusätzlich "Das seid ihr".
export default function PartnerCard({ partner }) {
  const preview = useIsPreview()
  const typeLabel = TYPE_LABELS[partner.typ] || partner.typ
  const badgeLabel = BADGE_LABELS[partner.badge] || partner.badge
  const website = websiteHref(partner)
  const teaser = isAllowedMedia(partner.teaserFoto, { preview }) ? partner.teaserFoto : null
  const isOwn = preview && partner.vorschau === true

  return (
    <article className={`partner-card card${isOwn ? ' is-own-preview' : ''}`}>
      {isOwn && (
        <p className="preview-own-badge">
          <Icon name="eye" />
          Das seid ihr
        </p>
      )}
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
        {teaser && (
          <img
            src={teaser}
            alt={`Einblick bei ${partner.name}`}
            className="partner-card-teaser"
            width={TEASER_SIZE}
            height={TEASER_SIZE}
            loading="lazy"
          />
        )}
      </div>
      <div className="partner-card-links">
        <InternalLink className="btn btn-ghost" to={`/p/${partner.slug}`}>
          Zum Portal
        </InternalLink>
        {website && (
          <ExternalLink className="btn btn-ghost" href={website}>
            <Icon name="globe" /> Website
          </ExternalLink>
        )}
        {hasCoords(partner) && (
          <>
            <ExternalLink className="btn btn-ghost" href={googleMapsUrl(partner)}>
              In Google Maps öffnen
            </ExternalLink>
            <ExternalLink className="btn btn-ghost" href={osmUrl(partner)}>
              OpenStreetMap
            </ExternalLink>
          </>
        )}
      </div>
    </article>
  )
}
