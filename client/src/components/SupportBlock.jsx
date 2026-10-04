import Icon from './Icon.jsx'
import { DiscoverEmpty } from './DiscoverChapter.jsx'
import { ExternalLink, InternalLink } from './PreviewLink.jsx'
import { PromotionList } from './PromotionCard.jsx'
import { formatEuroCents, isClickUrl, isPartnerMedia } from '../lib/discover.js'
import { isExternalUrl } from '../lib/format.js'

const NEW_TAB_HINT = ' (öffnet in neuem Tab)'

// Transparenzblock zum neuesten Spendenbericht - Beträge kommen in Cent vom Server.
function DonationReport({ report }) {
  const figures = [
    { label: 'Eingang', cents: report.eingangCents },
    { label: 'Kosten gedeckt', cents: report.kostenCents },
    { label: 'an Tierheime weitergegeben', cents: report.weitergeleitetCents }
  ].filter((figure) => formatEuroCents(figure.cents) !== null)

  return (
    <div className="support-report">
      <h3>
        Transparenz{report.zeitraum && <span className="support-report-period"> ({report.zeitraum})</span>}
      </h3>
      <dl className="support-report-figures">
        {figures.map((figure) => (
          <div key={figure.label}>
            <dt>{figure.label}</dt>
            <dd>{formatEuroCents(figure.cents)}</dd>
          </div>
        ))}
      </dl>
      {report.empfaenger && <p className="support-report-recipient">Weitergegeben an: {report.empfaenger}</p>}
      {isExternalUrl(report.nachweisUrl) && (
        <ExternalLink className="support-report-proof" href={report.nachweisUrl}>
          Nachweis ansehen<span className="visually-hidden">{NEW_TAB_HINT}</span>
          <Icon name="external" />
        </ExternalLink>
      )}
    </div>
  )
}

function PartnerDonations({ items }) {
  return (
    <div className="support-donations">
      <h3>Direkt an ein Tierheim spenden</h3>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <ExternalLink className="support-donation-link" href={item.clickUrl}>
              {/* Logo bewusst dekorativ (alt=""): es steht im selben Link wie "An <Name> spenden" - ein
                  Alternativtext würde den Namen nur doppelt vorlesen. */}
              {isPartnerMedia(item.logoUrl) ? (
                <img src={item.logoUrl} alt="" className="support-donation-logo" />
              ) : (
                <span className="support-donation-logo support-donation-logo-fallback" aria-hidden="true">
                  <Icon name="heart" />
                </span>
              )}
              <span className="support-donation-name">An {item.name} spenden</span>
              <span className="visually-hidden">{NEW_TAB_HINT}</span>
              <Icon name="external" />
            </ExternalLink>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Kapitel "Unterstützen": GoFundMe-Knopf, Text, Empfehlungen (bereich "unterstuetzen", direkt unter dem
// Aufruf), Transparenzblock und Spendenlinks der Partner-Tierheime. Alle externen Links laufen über die
// Klickzählung (clickUrl /r/...), nur der Nachweis ist ein direkter Link auf das hinterlegte Dokument.
// Leer ist das Kapitel nur, wenn ALLES davon fehlt. compact (Entdecken unter "Alle", Phase U): nur Aufruf
// und Empfehlungen - Bericht und Spendenlinks stehen im eigenen Reiter.
export default function SupportBlock({ support, compact = false }) {
  const hasGofundme = isClickUrl(support.gofundmeClickUrl)
  const donations = support.partnerSpenden.filter((item) => isClickUrl(item.clickUrl))

  if (!hasGofundme && !support.text && !support.bericht && donations.length === 0 && support.promotions.length === 0) {
    return (
      <DiscoverEmpty icon="heart">
        Noch keine Spendenmöglichkeiten hinterlegt – schaut in die <InternalLink to="/partner">Partnerliste</InternalLink>.
      </DiscoverEmpty>
    )
  }

  return (
    <div className={`support-block${compact ? ' is-compact' : ''}`}>
      {(support.text || hasGofundme) && (
        <div className="support-cta">
          {support.text && <p className="support-text">{support.text}</p>}
          {hasGofundme && (
            <ExternalLink className="btn btn-primary btn-lg" href={support.gofundmeClickUrl}>
              <Icon name="heart" />
              Über GoFundMe unterstützen<span className="visually-hidden">{NEW_TAB_HINT}</span>
            </ExternalLink>
          )}
        </div>
      )}
      <PromotionList items={support.promotions} compact={compact} />
      {!compact && support.bericht && <DonationReport report={support.bericht} />}
      {!compact && donations.length > 0 && <PartnerDonations items={donations} />}
    </div>
  )
}
