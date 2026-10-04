import Icon from './Icon.jsx'
import ContactPartnerButton from './ContactPartnerButton.jsx'
import PortalBanner from './PortalBanner.jsx'
import { hasPortalContact } from './PortalContact.jsx'
import { ExternalLink } from './PreviewLink.jsx'
import { isExternalUrl } from '../lib/format.js'
import { showContactForm } from '../lib/contactPartner.js'
import { portalBannerItems } from '../lib/partnerBanner.js'
import { PortalPanelProvider } from '../lib/portalPanel.js'
import { CONTACT_TAB, SECTION_IDS } from '../lib/portalTabs.js'
import { useIsPreview } from '../lib/preview.js'
import { TYPE_LABELS } from '../lib/partnerTypes.js'

// "Schreib uns" bzw. "Kontakt" im Kopf. Auf dem Reiter "Kontakt" steht derselbe Weg in der Kontakt-Karte direkt darunter -
// hier ist er dann verdeckt statt doppelt (concealed): unsichtbar, nicht bedienbar und für Screenreader weg, aber mit
// seinem Platz, damit Kopf und Reiter-Leiste beim Wechsel nicht springen. Ein offenes "Schreib uns" schließt sich dabei
// (PortalPanelProvider, wie in einem verborgenen Reiter). Ein <div>, weil "Schreib uns" seinen <dialog> mitbringt.
// inert als '' bzw. undefined: React 18 kennt das Attribut noch nicht als Boolean (ab React 19: inert={concealed}).
function ContactCta({ partner, hasForm, concealed, onShowTab }) {
  return (
    <PortalPanelProvider value={!concealed}>
      <div
        className={`partner-portal-contact-cta${concealed ? ' is-concealed' : ''}`}
        aria-hidden={concealed || undefined}
        inert={concealed ? '' : undefined}
      >
        {hasForm ? (
          <ContactPartnerButton partner={partner} />
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => onShowTab(CONTACT_TAB, SECTION_IDS.contact)}>
            <Icon name="message" />
            Kontakt
          </button>
        )}
      </div>
    </PortalPanelProvider>
  )
}

// Kopf des Portals wie eine ruhige Landingpage: Bannerfotos (Phase V4b), Logo, Art und Ort als Meta-Zeile, der Name
// als Überschrift, darunter der Portal-Titel als kurze Unterzeile - der Willkommenstext steht seit den Reitern in der
// Übersicht (PortalOverview), damit die Reiter am Handy schon im ersten Bild stehen. Die Hauptaktion "Schreib uns" (öffnet
// das Formular direkt; ohne Formular "Kontakt" zum Reiter), bei Tierheimen dazu Spenden und - nur ohne eigene Tiere in
// Vermittlung, sonst steht sie im Reiter "Tiere" - die externe Vermittlungsseite. Feedback-Runde: kein Einladungscode
// mehr im Kopf (der steht leise am Ende des Reiters "Kontakt", PortalCodeNote) und der Name nicht noch einmal in den
// Knöpfen. onContactTab: der Reiter "Kontakt" ist offen. onShowTab(key, abschnitt) wechselt den Reiter (PortalBody).
export default function PortalHero({ partner, hasAnimals = false, onContactTab = false, onShowTab }) {
  const preview = useIsPreview()
  const typeLabel = TYPE_LABELS[partner.typ] || partner.typ
  const meta = [typeLabel, partner.ort].filter(Boolean).join(' · ')
  const hasForm = showContactForm(partner)
  // Ein Kontaktweg genügt: mit Formular "Schreib uns", sonst "Kontakt" zum Reiter.
  const hasCta = hasPortalContact(partner)
  const hasSpenden = isExternalUrl(partner.spenden_url)
  const hasVermittlung = !hasAnimals && isExternalUrl(partner.vermittlung_url)
  const hasBanner = portalBannerItems(partner.banner, { preview }).length > 0

  return (
    <div className={`partner-portal-hero${hasBanner ? ' has-banner' : ''}`}>
      {hasBanner && <PortalBanner banner={partner.banner} layout={partner.bannerLayout} />}
      {partner.logoUrl && <img src={partner.logoUrl} alt={`Logo von ${partner.name}`} className="partner-logo" />}
      <div className="partner-portal-hero-text">
        {meta && <p className="partner-portal-meta">{meta}</p>}
        <h1>{partner.name}</h1>
        {partner.portal_titel && <p className="partner-portal-tagline">{partner.portal_titel}</p>}
      </div>
      {(hasCta || hasSpenden || hasVermittlung) && (
        <div className="partner-portal-links">
          {hasCta && <ContactCta partner={partner} hasForm={hasForm} concealed={onContactTab} onShowTab={onShowTab} />}
          {hasSpenden && (
            <ExternalLink href={partner.spenden_url} className="btn btn-ghost">
              <Icon name="heart" /> Spenden
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
