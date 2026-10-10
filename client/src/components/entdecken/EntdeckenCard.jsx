import { Link } from 'react-router-dom'
import Icon from '../Icon.jsx'
import PartnerMark from '../PartnerMark.jsx'
import { Card } from '../ui/index.js'
import { TYPE_LABELS } from '../../lib/partnerTypes.js'
import { formatDistanceKm } from '../../lib/format.js'
import { isPublicMedia } from '../../lib/discover.js'
import { t } from '../../lib/i18n/index.js'

const IMAGE_SIZE = 64

// Bild der Karte: Logo (ganz sichtbar) oder Foto (füllt die Fläche) - nur öffentliche Adressen, sonst ein ruhiges Zeichen.
function CardImage({ partner }) {
  if (!isPublicMedia(partner.bildUrl)) {
    return (
      <span className="entdecken-card-image is-empty" aria-hidden="true">
        <Icon name="paw" />
      </span>
    )
  }
  return (
    <img
      src={partner.bildUrl}
      alt=""
      className={`entdecken-card-image${partner.bildArt === 'logo' ? ' is-logo' : ''}`}
      width={IMAGE_SIZE}
      height={IMAGE_SIZE}
      loading="lazy"
    />
  )
}

// Wo: „deutschlandweit“ für freigegebene Partner, sonst PLZ und Ort, dazu die Entfernung nach einer Umkreissuche.
function placeText(partner) {
  if (partner.deutschlandweit) return t('deutschlandweit')
  return [partner.plz, partner.ort].filter(Boolean).join(' ')
}

// Eine Karte im öffentlichen Entdecken (/partner): Bild, Name, eine Meta-Zeile (Merkmal, Typ, Ort), ein kurzer Satz und
// der Weg zum Portal. Die ganze Karte ist über den Namen klickbar (der Link deckt sie per CSS ab).
export default function EntdeckenCard({ partner }) {
  const typeLabel = TYPE_LABELS[partner.typ] ? t(TYPE_LABELS[partner.typ]) : partner.typ
  const place = placeText(partner)
  return (
    <Card as="article" variant="interactive" pad="sm" className={`entdecken-card${partner.deutschlandweit ? ' is-deutschlandweit' : ''}`}>
      <CardImage partner={partner} />
      <div className="entdecken-card-body">
        <h3 className="entdecken-card-title">
          <Link to={`/p/${partner.slug}`} className="entdecken-card-link">
            {partner.name}
          </Link>
        </h3>
        <p className="entdecken-card-meta">
          <PartnerMark badge={partner.badge} />
          <span>{typeLabel}</span>
          {place && (
            <span className={partner.deutschlandweit ? 'entdecken-card-weit' : undefined}>
              {partner.deutschlandweit && <Icon name="globe" />}
              {place}
            </span>
          )}
          {typeof partner.distanceKm === 'number' && <span>{formatDistanceKm(partner.distanceKm)}</span>}
        </p>
        {partner.kurztext && <p className="entdecken-card-text">{partner.kurztext}</p>}
      </div>
      <Icon name="arrowRight" className="entdecken-card-arrow" aria-hidden="true" />
    </Card>
  )
}
