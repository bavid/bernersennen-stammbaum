import Icon from './Icon.jsx'
import ContactPartnerButton from './ContactPartnerButton.jsx'
import { ExternalLink } from './PreviewLink.jsx'
import { isExternalUrl, isValidPhone, mailtoHref, telHref } from '../lib/format.js'
import { showContactForm } from '../lib/contactPartner.js'

// Kontakt-Kasten des Portals (/p/:slug): oben die Wege, Kontakt aufzunehmen - "Schreib uns" (Phase P2,
// Nachricht ins Postfach des Partners, nur wenn der Server kontaktformular meldet) und das eigene
// Kontaktformular des Partners (extern) -, darunter Website, E-Mail und Telefon - nur, was hinterlegt ist.
// In der Kundensicht ist alles sichtbar, aber nicht anklickbar (PreviewLink.jsx, ContactPartnerButton).
export default function PortalContact({ partner }) {
  const hasForm = showContactForm(partner)
  const hasFormUrl = isExternalUrl(partner.kontakt_formular_url)
  const hasWebsite = isExternalUrl(partner.website)
  const phone = isValidPhone(partner.kontakt_telefon) ? partner.kontakt_telefon : null
  const mailto = mailtoHref(partner.kontakt_email)
  const hasDetails = Boolean(hasWebsite || partner.kontakt_email || partner.kontakt_telefon)
  if (!hasForm && !hasFormUrl && !hasDetails) return null

  return (
    <section className="card partner-portal-contact" aria-labelledby="partner-portal-contact-title">
      <h2 id="partner-portal-contact-title">Kontakt</h2>
      {(hasForm || hasFormUrl) && (
        <div className="partner-portal-contact-actions">
          {hasForm && <ContactPartnerButton partner={partner} />}
          {hasFormUrl && (
            <ExternalLink href={partner.kontakt_formular_url} className="btn btn-ghost">
              Zum Kontaktformular von {partner.name}
              <Icon name="external" />
            </ExternalLink>
          )}
        </div>
      )}
      {hasDetails && (
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
              <span className="visually-hidden">E-Mail: </span>
              {mailto ? (
                <ExternalLink href={mailto} newTab={false}>
                  {partner.kontakt_email}
                </ExternalLink>
              ) : (
                <span>{partner.kontakt_email}</span>
              )}
            </li>
          )}
          {partner.kontakt_telefon && (
            <li>
              <Icon name="phone" />
              <span className="visually-hidden">Telefon: </span>
              {phone ? (
                <ExternalLink href={telHref(phone)} newTab={false}>
                  {phone}
                </ExternalLink>
              ) : (
                <span>{partner.kontakt_telefon}</span>
              )}
            </li>
          )}
        </ul>
      )}
    </section>
  )
}
