import Avatar from './Avatar.jsx'
import Icon from './Icon.jsx'
import { ContactDetails, ContactPerson, hasContactInfo } from './PortalContact.jsx'
import { InternalLink } from './PreviewLink.jsx'
import { todayIso } from '../lib/dates.js'
import { PENDING_APPROVAL_LABEL, isPartnerMedia, isPendingApproval } from '../lib/discover.js'
import { CONTACT_TAB, OVERVIEW_POSTS, OVERVIEW_TERMINE, nextTermine, portalTermine, upcomingTerminCount } from '../lib/portalTabs.js'
import { useIsPreview } from '../lib/preview.js'
import { adoptionSectionTitle } from '../lib/shelter.js'
import { formatTagKurz, formatTagLang, formatUhrzeit, vorkommenKey } from '../lib/termine.js'
import { zeitraeumeText } from '../lib/zeitraeume.js'

// So viele Tiere zeigt die Übersicht als kleine Vorschau - alle stehen im Reiter "Tiere".
const OVERVIEW_ANIMALS = 4

// portal_text ist reiner Text (nie HTML) - Absätze trennt eine Leerzeile.
function paragraphsOf(text) {
  return (text || '')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
}

// Ein Block der Übersicht: Überschrift, kurzer Inhalt und "Alle …" zum passenden Reiter.
function OverviewBlock({ id, title, className, more, children }) {
  return (
    <section className={`portal-overview-block ${className}`} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      {children}
      {more && (
        <button type="button" className="link-button portal-overview-more" onClick={more.onClick}>
          {more.label}
          <Icon name="arrowRight" />
        </button>
      )}
    </section>
  )
}

function TerminRow({ item }) {
  const meta = [formatUhrzeit(item.uhrzeit, item.ende), item.ort].filter(Boolean).join(' · ')
  return (
    <li className="portal-overview-termin">
      <time dateTime={item.datum} className="portal-overview-termin-date">
        <span aria-hidden="true">{formatTagKurz(item.datum)}</span>
        <span className="visually-hidden">{formatTagLang(item.datum)}</span>
      </time>
      <span className="portal-overview-termin-body">
        <span className="portal-overview-termin-title">{item.titel}</span>
        {meta && <span className="portal-overview-termin-meta">{meta}</span>}
      </span>
    </li>
  )
}

// Ein Angebot in kurz: kleines Bild, Titel, zwei Zeilen Text und die Termine - Link und volle Karte im Reiter.
function PostTeaser({ post }) {
  const preview = useIsPreview()
  const termine = zeitraeumeText(post.zeitraeume, todayIso())
  return (
    <li className="portal-overview-post">
      {isPartnerMedia(post.bildUrl) && <img src={post.bildUrl} alt="" className="portal-overview-post-image" loading="lazy" />}
      <div className="portal-overview-post-body">
        <h3>{post.titel}</h3>
        {post.text && <p className="portal-overview-post-text">{post.text}</p>}
        {termine && (
          <p className="portal-overview-post-termine">
            <Icon name="calendar" />
            {termine}
          </p>
        )}
        {preview && isPendingApproval(post) && (
          <p className="promotion-badge promotion-badge-pending">
            <Icon name="clock" />
            {PENDING_APPROVAL_LABEL}
          </p>
        )}
      </div>
    </li>
  )
}

function AnimalStrip({ animals }) {
  return (
    <ul className="portal-overview-animals">
      {animals.slice(0, OVERVIEW_ANIMALS).map((animal) => (
        <li key={animal.slug}>
          <InternalLink to={`/t/${animal.slug}`} className="portal-overview-animal">
            <Avatar dog={{ foto_url: animal.fotoUrl, name: animal.name }} size={48} />
            <span>{animal.name}</span>
          </InternalLink>
        </li>
      ))}
    </ul>
  )
}

// Reiter "Übersicht" des Portals (Vorgabe): der Willkommenstext, bei Tierheimen eine kleine Tier-Vorschau, die ersten
// Angebote, die nächsten Termine und eine Kontaktzeile - kurz, alles Weitere im jeweiligen Reiter (onShowTab). Die
// Kontaktzeile nur mit etwas zum Nachlesen (Ansprechperson, Website, E-Mail, Telefon) - "Schreib uns" steht im Kopf, der
// Einladungscode nur im Reiter "Kontakt".
// Am Desktop zweispaltig (Text und Angebote links, Termine und Kontakt rechts), am Handy untereinander.
export default function PortalOverview({ partner, posts, animals, onShowTab }) {
  const paragraphs = paragraphsOf(partner.portal_text)
  const allTermine = portalTermine(partner.termine)
  const termine = nextTermine(allTermine, OVERVIEW_TERMINE)
  // Feedback-Runde: dieselbe Zahl wie am Reiter "Termine".
  const terminCount = upcomingTerminCount(allTermine)
  const firstPosts = posts.slice(0, OVERVIEW_POSTS)
  const hasContact = hasContactInfo(partner)
  const hasMain = paragraphs.length > 0 || animals.length > 0 || firstPosts.length > 0
  const hasSide = termine.length > 0 || hasContact

  if (!hasMain && !hasSide) {
    return <p className="muted portal-overview-empty">Mehr über {partner.name} steht in den Reitern oben.</p>
  }

  return (
    <div className="portal-overview">
      {hasMain && (
        <div className="portal-overview-main">
          {paragraphs.length > 0 && (
            <section className="portal-overview-about" aria-labelledby="portal-overview-about-title">
              <h2 id="portal-overview-about-title">Über uns</h2>
              {paragraphs.map((paragraph, index) => (
                <p key={index} className="partner-portal-text">
                  {paragraph}
                </p>
              ))}
            </section>
          )}
          {animals.length > 0 && (
            <OverviewBlock
              id="portal-overview-animals"
              title={adoptionSectionTitle(animals)}
              className="portal-overview-animals-block"
              more={{ label: animals.length === 1 ? 'Zum Reiter Tiere' : `Alle ${animals.length} Tiere ansehen`, onClick: () => onShowTab('tiere') }}
            >
              <AnimalStrip animals={animals} />
            </OverviewBlock>
          )}
          {firstPosts.length > 0 && (
            <OverviewBlock
              id="portal-overview-posts"
              title="Angebote & Aktuelles"
              className="portal-overview-posts-block"
              more={{ label: posts.length > firstPosts.length ? `Alle ${posts.length} Angebote` : 'Zu den Angeboten', onClick: () => onShowTab('angebote') }}
            >
              <ul className="portal-overview-posts">
                {firstPosts.map((post) => (
                  <PostTeaser key={post.id} post={post} />
                ))}
              </ul>
            </OverviewBlock>
          )}
        </div>
      )}
      {hasSide && (
        <div className="portal-overview-side">
          {termine.length > 0 && (
            <OverviewBlock
              id="portal-overview-termine"
              title="Nächste Termine"
              className="card portal-overview-termine-block"
              more={{ label: terminCount > 1 ? `${terminCount} Termine ansehen` : 'Zu den Terminen', onClick: () => onShowTab('termine') }}
            >
              <ul className="portal-overview-termine">
                {termine.map((item) => (
                  <TerminRow key={vorkommenKey(item)} item={item} />
                ))}
              </ul>
            </OverviewBlock>
          )}
          {hasContact && (
            <OverviewBlock
              id="portal-overview-contact"
              title="Kontakt"
              className="card portal-overview-contact"
              more={{ label: 'Alle Kontaktwege', onClick: () => onShowTab(CONTACT_TAB) }}
            >
              <ContactPerson name={partner.ansprechperson} />
              <ContactDetails partner={partner} />
            </OverviewBlock>
          )}
        </div>
      )}
    </div>
  )
}
