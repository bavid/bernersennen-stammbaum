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
export default function SteckbriefShelterBox({ shelter, animalName, animalSlug }) {
  const preview = useIsPreview()
  const hasForm = showContactForm(shelter, { preview }) && (preview || Boolean(animalSlug))
  const mailto = mailtoHref(shelter.kontakt_email)

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
      <div className="partner-portal-contact">
        <h3>Anfrage direkt beim Tierheim</h3>
        <ul>
          {isExternalUrl(shelter.website) && (
            <li>
              <Icon name="globe" />
              <ExternalLink href={shelter.website}>{shelter.website}</ExternalLink>
            </li>
          )}
          {mailto && (
            <li>
              <Icon name="mail" />
              <ExternalLink href={mailto} newTab={false}>
                {shelter.kontakt_email}
              </ExternalLink>
            </li>
          )}
          {isValidPhone(shelter.kontakt_telefon) && (
            <li>
              <Icon name="phone" />
              <ExternalLink href={telHref(shelter.kontakt_telefon)} newTab={false}>
                {shelter.kontakt_telefon}
              </ExternalLink>
            </li>
          )}
        </ul>
        {isExternalUrl(shelter.vermittlung_url) && (
          <ExternalLink href={shelter.vermittlung_url} className="btn btn-ghost">
            Zur Vermittlungsseite
          </ExternalLink>
        )}
      </div>
      <InternalLink className={`btn ${hasForm ? 'btn-ghost' : 'btn-primary'} btn-block`} to={`/p/${shelter.slug}`}>
        Zum Portal von {shelter.name}
      </InternalLink>
    </section>
  )
}
