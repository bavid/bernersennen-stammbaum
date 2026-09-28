import Icon from './Icon.jsx'
import { isAnzeige, isClickUrl, kennzeichnungLabel, promotionRel } from '../lib/discover.js'

// Bilder von Empfehlungen liegen immer unter /partner-media (server/routes/discover.js promotionCard).
function isPartnerMedia(url) {
  return typeof url === 'string' && url.startsWith('/partner-media/')
}

// Eine Empfehlung/Anzeige im Reiter "Entdecken" (Futter, Hundeschule): Kennzeichnung zuerst und als
// Text (auch für Screenreader), dann Bild, Titel, Text und der Link über die Klickzählung (clickUrl).
// "Anzeige" ist bezahlt/provisioniert: auffälliges Badge und rel="sponsored".
export default function PromotionCard({ promotion }) {
  const anzeige = isAnzeige(promotion.kennzeichnung)
  const hasLink = isClickUrl(promotion.clickUrl)

  return (
    <article className={`promotion-card card${anzeige ? ' promotion-card-anzeige' : ''}`}>
      <p className={`promotion-badge${anzeige ? ' promotion-badge-anzeige' : ''}`}>{kennzeichnungLabel(promotion)}</p>
      {isPartnerMedia(promotion.bildUrl) && <img src={promotion.bildUrl} alt="" className="promotion-card-image" loading="lazy" />}
      <div className="promotion-card-body">
        <h3>{promotion.titel}</h3>
        {promotion.text && <p className="promotion-card-text">{promotion.text}</p>}
      </div>
      {hasLink && (
        <a className="btn btn-ghost promotion-card-link" href={promotion.clickUrl} target="_blank" rel={promotionRel(promotion.kennzeichnung)}>
          Mehr erfahren<span className="visually-hidden">: {promotion.titel} (öffnet in neuem Tab)</span>
          <Icon name="external" />
        </a>
      )}
    </article>
  )
}
