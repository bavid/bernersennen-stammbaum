import Icon from './Icon.jsx'
import { ExternalLink } from './PreviewLink.jsx'
import { isAnzeige, isClickUrl, isPartnerMedia, kennzeichnungLabel, promotionRel } from '../lib/discover.js'

// Eine Empfehlung/Anzeige im Reiter "Entdecken" (Hundeschule, Begleiter, Futter, Unterstützen):
// Kennzeichnung zuerst und als Text (auch für Screenreader), dann Bild, Titel, Text und der Link über die
// Klickzählung (clickUrl). "Anzeige" ist bezahlt/provisioniert: auffälliges Badge und rel="sponsored".
export default function PromotionCard({ promotion }) {
  const anzeige = isAnzeige(promotion.kennzeichnung)
  const hasLink = isClickUrl(promotion.clickUrl)

  return (
    <article className={`promotion-card card${anzeige ? ' promotion-card-anzeige' : ''}`}>
      <p className={`promotion-badge${anzeige ? ' promotion-badge-anzeige' : ''}`}>{kennzeichnungLabel(promotion)}</p>
      {/* Das Bild steht außerhalb des Links ("Mehr erfahren") - es ist also nicht Teil eines Namens, der
          den Titel schon nennt, und bekommt den Titel als Alternativtext. */}
      {isPartnerMedia(promotion.bildUrl) && (
        <img src={promotion.bildUrl} alt={promotion.titel} className="promotion-card-image" loading="lazy" />
      )}
      <div className="promotion-card-body">
        <h3>{promotion.titel}</h3>
        {promotion.text && <p className="promotion-card-text">{promotion.text}</p>}
      </div>
      {hasLink && (
        <ExternalLink className="btn btn-ghost promotion-card-link" href={promotion.clickUrl} rel={promotionRel(promotion.kennzeichnung)}>
          Mehr erfahren<span className="visually-hidden">: {promotion.titel} (öffnet in neuem Tab)</span>
          <Icon name="external" />
        </ExternalLink>
      )}
    </article>
  )
}

// Empfehlungen als eigenes Raster (Begleiter, Futter, Unterstützen) - eine leere Liste rendert nichts, damit
// sie die Leerzustände der Kapitel nicht verändert.
export function PromotionList({ items }) {
  if (items.length === 0) return null
  return (
    <ul className="promotion-list">
      {items.map((promotion) => (
        <li key={promotion.id}>
          <PromotionCard promotion={promotion} />
        </li>
      ))}
    </ul>
  )
}
