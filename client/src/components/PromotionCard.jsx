import Icon from './Icon.jsx'
import { ExternalLink } from './PreviewLink.jsx'
import {
  PENDING_APPROVAL_LABEL,
  isAnzeige,
  isClickUrl,
  isPartnerMedia,
  isPendingApproval,
  kennzeichnungLabel,
  promotionRel
} from '../lib/discover.js'
import { useIsPreview } from '../lib/preview.js'
import { todayIso } from '../lib/dates.js'
import { zeitraeumeText } from '../lib/zeitraeume.js'

// Eine Empfehlung/Anzeige im Reiter "Entdecken" (Hundeschule, Salon, Begleiter, Futter, Unterstützen) und
// auf dem Portal ("Aktuelles"): Kennzeichnung zuerst und als Text (auch für Screenreader), dann Bild, Titel,
// Text und der Link über die Klickzählung (clickUrl). "Anzeige" ist bezahlt/provisioniert: auffälliges Badge
// und rel="sponsored". In der Kundensicht (Phase P2) tragen eigene, noch nicht freigegebene Beiträge
// zusätzlich "Wartet auf Freigabe". labelled={false} (Phase U): auf dem eigenen Portal des Partners ohne
// Kennzeichnung - es ist seine Seite; "Wartet auf Freigabe" bleibt, der Link behält sein rel.
export default function PromotionCard({ promotion, labelled = true }) {
  const preview = useIsPreview()
  const anzeige = labelled && isAnzeige(promotion.kennzeichnung)
  const hasLink = isClickUrl(promotion.clickUrl)
  const pending = preview && isPendingApproval(promotion)
  // Phase V4a: kommende Termine der Anzeige - "Termine: 1.2., 1.3., 5.–10.5.".
  const termine = zeitraeumeText(promotion.zeitraeume, todayIso())

  return (
    <article className={`promotion-card card${anzeige ? ' promotion-card-anzeige' : ''}${pending ? ' is-pending' : ''}`}>
      {(labelled || pending) && (
        <div className="promotion-badges">
          {labelled && <p className={`promotion-badge${anzeige ? ' promotion-badge-anzeige' : ''}`}>{kennzeichnungLabel(promotion)}</p>}
          {pending && (
            <p className="promotion-badge promotion-badge-pending">
              <Icon name="clock" />
              {PENDING_APPROVAL_LABEL}
            </p>
          )}
        </div>
      )}
      {/* Das Bild steht außerhalb des Links ("Mehr erfahren") - es ist also nicht Teil eines Namens, der
          den Titel schon nennt, und bekommt den Titel als Alternativtext. */}
      {isPartnerMedia(promotion.bildUrl) && (
        <img src={promotion.bildUrl} alt={promotion.titel} className="promotion-card-image" loading="lazy" />
      )}
      <div className="promotion-card-body">
        <h3>{promotion.titel}</h3>
        {promotion.text && <p className="promotion-card-text">{promotion.text}</p>}
        {termine && (
          <p className="promotion-card-termine">
            <Icon name="calendar" />
            {termine}
          </p>
        )}
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

// Empfehlungen als eigenes Raster (Begleiter, Futter, Unterstützen, Portal) - eine leere Liste rendert
// nichts, damit sie die Leerzustände der Kapitel nicht verändert.
export function PromotionList({ items, labelled = true }) {
  if (items.length === 0) return null
  return (
    <ul className="promotion-list">
      {items.map((promotion) => (
        <li key={promotion.id}>
          <PromotionCard promotion={promotion} labelled={labelled} />
        </li>
      ))}
    </ul>
  )
}
