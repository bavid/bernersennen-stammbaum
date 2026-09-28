import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import { DiscoverEmpty } from './DiscoverChapter.jsx'
import { formatEuroCents, isClickUrl } from '../lib/discover.js'
import { isExternalUrl } from '../lib/format.js'

const NEW_TAB_HINT = ' (öffnet in neuem Tab)'

function isPartnerMedia(url) {
  return typeof url === 'string' && url.startsWith('/partner-media/')
}

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
        <a className="support-report-proof" href={report.nachweisUrl} target="_blank" rel="noopener noreferrer">
          Nachweis ansehen<span className="visually-hidden">{NEW_TAB_HINT}</span>
          <Icon name="external" />
        </a>
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
            <a className="support-donation-link" href={item.clickUrl} target="_blank" rel="noopener noreferrer">
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
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Kapitel "Unterstützen": GoFundMe-Knopf, Text, Transparenzblock und Spendenlinks der Partner-Tierheime.
// Alle externen Links laufen über die Klickzählung (clickUrl /r/...), nur der Nachweis ist ein direkter
// Link auf das hinterlegte Dokument.
export default function SupportBlock({ support }) {
  const hasGofundme = isClickUrl(support.gofundmeClickUrl)
  const donations = support.partnerSpenden.filter((item) => isClickUrl(item.clickUrl))

  if (!hasGofundme && !support.text && !support.bericht && donations.length === 0) {
    return (
      <DiscoverEmpty icon="heart">
        Noch keine Spendenmöglichkeiten hinterlegt – schau in die <Link to="/partner">Partnerliste</Link>.
      </DiscoverEmpty>
    )
  }

  return (
    <div className="support-block">
      {(support.text || hasGofundme) && (
        <div className="support-cta">
          {support.text && <p className="support-text">{support.text}</p>}
          {hasGofundme && (
            <a className="btn btn-primary btn-lg" href={support.gofundmeClickUrl} target="_blank" rel="noopener noreferrer">
              <Icon name="heart" />
              Über GoFundMe unterstützen<span className="visually-hidden">{NEW_TAB_HINT}</span>
            </a>
          )}
        </div>
      )}
      {support.bericht && <DonationReport report={support.bericht} />}
      {donations.length > 0 && <PartnerDonations items={donations} />}
    </div>
  )
}
