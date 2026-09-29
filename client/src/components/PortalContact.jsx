import Icon from './Icon.jsx'
import { ExternalLink } from './PreviewLink.jsx'
import { isExternalUrl } from '../lib/format.js'

// Kontakt-Kasten des Portals (/p/:slug): Website, E-Mail, Telefon - nur, was hinterlegt ist. In der
// Kundensicht sind Website und E-Mail sichtbar, aber nicht anklickbar (PreviewLink.jsx).
export default function PortalContact({ partner }) {
  const hasWebsite = isExternalUrl(partner.website)
  if (!hasWebsite && !partner.kontakt_email && !partner.kontakt_telefon) return null

  return (
    <section className="card partner-portal-contact">
      <h2>Kontakt</h2>
      <ul>
        {hasWebsite && (
          <li>
            <Icon name="globe" />
            <ExternalLink href={partner.website}>{partner.website}</ExternalLink>
          </li>
        )}
        {partner.kontakt_email && (
          <li>
            <Icon name="mail" />
            <ExternalLink href={`mailto:${partner.kontakt_email}`} newTab={false}>
              {partner.kontakt_email}
            </ExternalLink>
          </li>
        )}
        {partner.kontakt_telefon && (
          <li>
            <Icon name="phone" />
            <span>{partner.kontakt_telefon}</span>
          </li>
        )}
      </ul>
    </section>
  )
}
