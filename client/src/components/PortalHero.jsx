import Icon from './Icon.jsx'
import { ExternalLink } from './PreviewLink.jsx'
import { isExternalUrl } from '../lib/format.js'
import { TYPE_LABELS } from '../lib/partnerTypes.js'

// portal_text ist reiner Text (nie HTML) - Absätze trennt eine Leerzeile.
function paragraphsOf(text) {
  return (text || '')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
}

// Springt zum Kontakt-Abschnitt und setzt den Fokus auf dessen Überschrift (PortalSection, tabIndex -1) -
// Tastatur und Screenreader landen so dort, wo der Blick hinspringt.
function jumpTo(targetId) {
  const heading = document.getElementById(`${targetId}-title`)
  const target = document.getElementById(targetId)
  target?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  heading?.focus({ preventScroll: true })
}

// Kopf des Portals wie eine ruhige Landingpage: Logo, Art und Ort als Meta-Zeile, der Name als Überschrift,
// darunter der Portal-Titel als Unterzeile und der Willkommenstext. Hauptaktion "Kontakt" (nur, wenn es
// einen Kontakt-Abschnitt gibt: contactId), daneben Spenden und Vermittlung bei Tierheimen.
export default function PortalHero({ partner, contactId }) {
  const typeLabel = TYPE_LABELS[partner.typ] || partner.typ
  const meta = [typeLabel, partner.ort].filter(Boolean).join(' · ')
  const hasSpenden = isExternalUrl(partner.spenden_url)
  const hasVermittlung = isExternalUrl(partner.vermittlung_url)

  return (
    <div className="partner-portal-hero">
      {partner.logoUrl && <img src={partner.logoUrl} alt={`Logo von ${partner.name}`} className="partner-logo" />}
      <div className="partner-portal-hero-text">
        {meta && <p className="partner-portal-meta">{meta}</p>}
        <h1>{partner.name}</h1>
        {partner.portal_titel && <p className="partner-portal-tagline">{partner.portal_titel}</p>}
        {paragraphsOf(partner.portal_text).map((paragraph, index) => (
          <p key={index} className="partner-portal-text">
            {paragraph}
          </p>
        ))}
      </div>
      {(contactId || hasSpenden || hasVermittlung) && (
        <div className="partner-portal-links">
          {contactId && (
            <button type="button" className="btn btn-primary" onClick={() => jumpTo(contactId)}>
              <Icon name="message" />
              Kontakt
            </button>
          )}
          {hasSpenden && (
            <ExternalLink href={partner.spenden_url} className="btn btn-ghost">
              <Icon name="heart" /> Spenden an {partner.name}
            </ExternalLink>
          )}
          {hasVermittlung && (
            <ExternalLink href={partner.vermittlung_url} className="btn btn-ghost">
              Tiere in Vermittlung
            </ExternalLink>
          )}
        </div>
      )}
    </div>
  )
}
