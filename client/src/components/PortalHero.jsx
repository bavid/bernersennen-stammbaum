import Icon from './Icon.jsx'
import ContactPartnerButton from './ContactPartnerButton.jsx'
import PortalBanner from './PortalBanner.jsx'
import { hasPortalContact } from './PortalContact.jsx'
import { ExternalLink } from './PreviewLink.jsx'
import { isExternalUrl } from '../lib/format.js'
import { showContactForm } from '../lib/contactPartner.js'
import { portalBannerItems } from '../lib/partnerBanner.js'
import { CONTACT_TAB, SECTION_IDS } from '../lib/portalTabs.js'
import { useIsPreview } from '../lib/preview.js'
import { TYPE_LABELS } from '../lib/partnerTypes.js'

// Kopf des Portals wie eine ruhige Landingpage: Bannerfotos (Phase V4b), Logo, Art und Ort als Meta-Zeile, der Name
// als Überschrift, darunter der Portal-Titel als kurze Unterzeile - der Willkommenstext steht seit den Reitern in der
// Übersicht (PortalOverview), damit die Reiter am Handy schon im ersten Bild stehen. Die Hauptaktionen als Knöpfe:
// "Schreib uns" (öffnet das Formular direkt; ohne Formular "Kontakt" zum Reiter), "Gutschein einlösen" (Reiter
// "Kontakt", Abschnitt Gutschein), bei Tierheimen Spenden und - nur ohne eigene Tiere in Vermittlung, sonst steht sie
// im Reiter "Tiere" - die externe Vermittlungsseite. onShowTab(key, abschnitt) wechselt den Reiter (PortalBody).
export default function PortalHero({ partner, hasAnimals = false, onShowTab }) {
  const preview = useIsPreview()
  const typeLabel = TYPE_LABELS[partner.typ] || partner.typ
  const meta = [typeLabel, partner.ort].filter(Boolean).join(' · ')
  const hasForm = showContactForm(partner)
  const hasContactTab = !hasForm && hasPortalContact(partner)
  const hasSpenden = isExternalUrl(partner.spenden_url)
  const hasVermittlung = !hasAnimals && isExternalUrl(partner.vermittlung_url)
  const hasBanner = portalBannerItems(partner.banner, { preview }).length > 0
  const redeemClass = hasForm || hasContactTab ? 'btn btn-ghost' : 'btn btn-primary'

  return (
    <div className={`partner-portal-hero${hasBanner ? ' has-banner' : ''}`}>
      {hasBanner && <PortalBanner banner={partner.banner} />}
      {partner.logoUrl && <img src={partner.logoUrl} alt={`Logo von ${partner.name}`} className="partner-logo" />}
      <div className="partner-portal-hero-text">
        {meta && <p className="partner-portal-meta">{meta}</p>}
        <h1>{partner.name}</h1>
        {partner.portal_titel && <p className="partner-portal-tagline">{partner.portal_titel}</p>}
      </div>
      <div className="partner-portal-links">
        {hasForm && <ContactPartnerButton partner={partner} />}
        {hasContactTab && (
          <button type="button" className="btn btn-primary" onClick={() => onShowTab(CONTACT_TAB, SECTION_IDS.contact)}>
            <Icon name="message" />
            Kontakt
          </button>
        )}
        <button type="button" className={redeemClass} onClick={() => onShowTab(CONTACT_TAB, SECTION_IDS.gutschein)}>
          Gutschein einlösen
        </button>
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
    </div>
  )
}
