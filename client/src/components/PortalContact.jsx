import Icon from './Icon.jsx'
import PortalSection from './PortalSection.jsx'
import ContactPartnerButton from './ContactPartnerButton.jsx'
import { ExternalLink } from './PreviewLink.jsx'
import { isExternalUrl, isValidPhone, mailtoHref, telHref } from '../lib/format.js'
import { showContactForm } from '../lib/contactPartner.js'
import { SECTION_IDS } from '../lib/portalTabs.js'

// Sprungziel für "Kontakt" im Kopf des Portals (PortalHero) - die id des Abschnitts.
export const PORTAL_CONTACT_ID = SECTION_IDS.contact

function contactFlags(partner) {
  const hasForm = showContactForm(partner)
  const hasFormUrl = isExternalUrl(partner.kontakt_formular_url)
  const hasWebsite = isExternalUrl(partner.website)
  const hasDetails = Boolean(hasWebsite || partner.kontakt_email || partner.kontakt_telefon)
  return { hasForm, hasFormUrl, hasWebsite, hasDetails }
}

// Gibt es überhaupt einen Weg, den Partner zu erreichen? Sonst entfällt der Abschnitt (und der Kopf-Knopf).
export function hasPortalContact(partner) {
  const { hasForm, hasFormUrl, hasDetails } = contactFlags(partner)
  return hasForm || hasFormUrl || hasDetails
}

// Phase V4b: die Ansprechperson (reiner Text, höchstens 80 Zeichen) - neutral "Ansprechperson: Anna Berg".
export function ContactPerson({ name }) {
  if (typeof name !== 'string' || !name.trim()) return null
  return (
    <p className="partner-portal-contact-person">
      <Icon name="users" />
      <span>
        Ansprechperson: <strong>{name.trim()}</strong>
      </span>
    </p>
  )
}

// Website, E-Mail und Telefon - nur, was hinterlegt ist. Was sich nicht sicher verlinken lässt, erscheint als reiner
// Text statt zu verschwinden. Auf dem Reiter "Kontakt" und kurz in der Übersicht (PortalOverview).
export function ContactDetails({ partner }) {
  const { hasWebsite, hasDetails } = contactFlags(partner)
  if (!hasDetails) return null
  const phone = isValidPhone(partner.kontakt_telefon) ? partner.kontakt_telefon : null
  const mailto = mailtoHref(partner.kontakt_email)

  return (
    <ul className="partner-portal-contact-details">
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
  )
}

// Kontakt-Abschnitt des Portals (Reiter "Kontakt"): oben die Wege, Kontakt aufzunehmen - "Schreib uns" (Phase P2,
// Nachricht ins Postfach des Partners, nur wenn der Server kontaktformular meldet) und das eigene Kontaktformular des
// Partners (extern) -, darunter Website, E-Mail und Telefon. In der Kundensicht ist alles sichtbar, aber nicht
// anklickbar (PreviewLink.jsx, ContactPartnerButton).
export default function PortalContact({ partner }) {
  const { hasForm, hasFormUrl, hasDetails } = contactFlags(partner)
  if (!hasForm && !hasFormUrl && !hasDetails) return null

  return (
    <PortalSection id={PORTAL_CONTACT_ID} title="Kontakt">
      <div className="card partner-portal-contact">
        <ContactPerson name={partner.ansprechperson} />
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
        <ContactDetails partner={partner} />
      </div>
    </PortalSection>
  )
}
