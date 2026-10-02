import Icon from './Icon.jsx'
import MapLinks from './MapLinks.jsx'
import PartnerMark from './PartnerMark.jsx'
import { ExternalLink, InternalLink } from './PreviewLink.jsx'
import { TYPE_LABELS } from '../lib/partnerTypes.js'
import { formatDistanceKm, isExternalUrl } from '../lib/format.js'
import { isAllowedMedia, isClickUrl } from '../lib/discover.js'
import { useIsPreview } from '../lib/preview.js'

const TEASER_SIZE = 72

// Im Reiter "Entdecken" liefert der Server die Website als clickUrl (/r/partner-website/:id, anonyme
// Klickzählung) statt roh in website - dann führt der Link darüber, sonst wie bisher direkt.
function websiteHref(partner) {
  if (isClickUrl(partner.clickUrl)) return partner.clickUrl
  return isExternalUrl(partner.website) ? partner.website : null
}

// Bild links neben dem Namen: das Logo - ohne Logo das neueste Einblick-Foto (teaserFoto, Phase P1), sonst ein
// ruhiges Platzhalter-Symbol. Nie beides nebeneinander: in einer schmalen Karte bliebe dem Namen kein Platz. Auch für die
// Partner-Karte in "Entdecken" (PartnerDiscoverCard, Phase V1).
export function CardVisual({ partner, teaser }) {
  if (partner.logoUrl) return <img src={partner.logoUrl} alt="" className="partner-card-logo" />
  if (teaser) {
    return (
      <img
        src={teaser}
        alt={`Einblick bei ${partner.name}`}
        className="partner-card-teaser"
        width={TEASER_SIZE}
        height={TEASER_SIZE}
        loading="lazy"
      />
    )
  }
  return (
    <span className="partner-card-logo partner-card-logo-fallback" aria-hidden="true">
      <Icon name="mapPin" />
    </span>
  )
}

// Eine Partnerkarte (Partnerliste /partner, Entdecken): Bild, Name, darunter EINE ruhige Meta-Zeile (Partner-
// Merkmal, Typ, Ort, Entfernung), dann "Zum Portal" und leise Links zu Website und Karte. Das teaserFoto nur als
// öffentliches Foto, in der Kundensicht auch das eigene über /uploads. Dort bekommt die eigene Karte (vorschau:
// true) zusätzlich "Das seid ihr".
export default function PartnerCard({ partner }) {
  const preview = useIsPreview()
  const typeLabel = TYPE_LABELS[partner.typ] || partner.typ
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
        <CardVisual partner={partner} teaser={teaser} />
        <div className="partner-card-title">
          <h3>{partner.name}</h3>
          <p className="partner-card-meta">
            <PartnerMark badge={partner.badge} />
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
        <InternalLink className="btn btn-ghost" to={`/p/${partner.slug}`}>
          Zum Portal
        </InternalLink>
        {website && (
          <ExternalLink className="card-link" href={website}>
            <Icon name="globe" /> Website
          </ExternalLink>
        )}
        <MapLinks item={partner} />
      </div>
    </article>
  )
}
