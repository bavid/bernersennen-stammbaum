import Icon from './Icon.jsx'
import ContactPartnerButton from './ContactPartnerButton.jsx'
import { ExternalLink, InternalLink } from './PreviewLink.jsx'
import { isExternalUrl, isValidPhone, mailtoHref, telHref } from '../lib/format.js'
import { showContactForm } from '../lib/contactPartner.js'
import { useIsPreview } from '../lib/preview.js'

// Tierheim-Kasten am Ende des Steckbriefs (/t/:slug, SteckbriefPage): die Vermittlung läuft direkt über
// das Tierheim - per "Schreib uns zu {Tiername}" (Phase P2, mit bezugSlug, damit das Tierheim weiß, um
// welches Tier es geht; nur wenn der Server das Formular meldet), Website, E-Mail, Telefon oder die
// eigene Vermittlungsseite. animalSlug fehlt in der Kundensicht - dort ist der Knopf ohnehin deaktiviert.
// Phase U: "Anfrage direkt beim Tierheim" nur mit Kontaktdaten; Vermittlungsseite und Portal als zweitrangige
// Knöpfe in einer Zeile unter der einen Hauptaktion.
export default function SteckbriefShelterBox({ shelter, animalName, animalSlug }) {
  const preview = useIsPreview()
  const hasForm = showContactForm(shelter) && (preview || Boolean(animalSlug))
  const mailto = mailtoHref(shelter.kontakt_email)
  const hasWebsite = isExternalUrl(shelter.website)
  const hasContacts = hasWebsite || Boolean(shelter.kontakt_email) || Boolean(shelter.kontakt_telefon)

  return (
    <section className="card steckbrief-shelter">
      <div className="steckbrief-shelter-head">
        {shelter.logoUrl && <img src={shelter.logoUrl} alt={`Logo von ${shelter.name}`} className="partner-logo" />}
        <div>
          <span className="eyebrow">Tierheim</span>
          <h2>{shelter.name}</h2>
        </div>
      </div>
      <p className="steckbrief-shelter-note">Die Vermittlung läuft direkt über das Tierheim.</p>
      {hasForm && (
        <ContactPartnerButton partner={shelter} bezugSlug={animalSlug} label={`Schreib uns zu ${animalName}`} className="btn btn-primary btn-block" />
      )}
      {hasContacts && (
        <div className="partner-portal-contact">
          <h3>Anfrage direkt beim Tierheim</h3>
          <ul>
            {hasWebsite && (
              <li>
                <Icon name="globe" />
                <ExternalLink href={shelter.website}>{shelter.website}</ExternalLink>
              </li>
            )}
            {/* Wie PortalContact: was sich nicht sicher verlinken lässt, erscheint als reiner Text statt zu verschwinden */}
            {shelter.kontakt_email && (
              <li>
                <Icon name="mail" />
                <span className="visually-hidden">E-Mail: </span>
                {mailto ? (
                  <ExternalLink href={mailto} newTab={false}>
                    {shelter.kontakt_email}
                  </ExternalLink>
                ) : (
                  <span>{shelter.kontakt_email}</span>
                )}
              </li>
            )}
            {shelter.kontakt_telefon && (
              <li>
                <Icon name="phone" />
                <span className="visually-hidden">Telefon: </span>
                {isValidPhone(shelter.kontakt_telefon) ? (
                  <ExternalLink href={telHref(shelter.kontakt_telefon)} newTab={false}>
                    {shelter.kontakt_telefon}
                  </ExternalLink>
                ) : (
                  <span>{shelter.kontakt_telefon}</span>
                )}
              </li>
            )}
          </ul>
        </div>
      )}
      <div className="steckbrief-shelter-actions">
        {isExternalUrl(shelter.vermittlung_url) && (
          <ExternalLink href={shelter.vermittlung_url} className="btn btn-ghost">
            Zur Vermittlungsseite
          </ExternalLink>
        )}
        <InternalLink className={`btn ${hasForm ? 'btn-ghost' : 'btn-primary'}`} to={`/p/${shelter.slug}`}>
          Zum Portal von {shelter.name}
        </InternalLink>
      </div>
    </section>
  )
}
