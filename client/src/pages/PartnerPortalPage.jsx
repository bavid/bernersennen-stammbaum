import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../api'
import ThemeMark from '../components/ThemeMark.jsx'
import AnimalAdoptionCard from '../components/AnimalAdoptionCard.jsx'
import HappyEndCard from '../components/HappyEndCard.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import PublicHeader from '../components/PublicHeader.jsx'
import PortalAction from '../components/PortalAction.jsx'
import PortalBrandStrip from '../components/PortalBrandStrip.jsx'
import PortalContact, { PORTAL_CONTACT_ID, hasPortalContact } from '../components/PortalContact.jsx'
import PortalHero from '../components/PortalHero.jsx'
import PortalPosts from '../components/PortalPosts.jsx'
import PortalSection from '../components/PortalSection.jsx'
import EinblickeGallery from '../components/EinblickeGallery.jsx'
import { isValidHexColor, darkenHex, hexToRgba } from '../lib/color.js'
import { PreviewProvider } from '../lib/preview.js'
import { adoptionSectionTitle } from '../lib/shelter.js'

const ON_RUST = '#fffaf2'
const ACCENT_WASH_ALPHA = 0.1
const PREVIEW_LOAD_ERROR = 'Die Vorschau konnte gerade nicht geladen werden. Bitte versucht es gleich noch einmal.'

// Nie einen rohen String ins Inline-Style schreiben: die Akzentfarbe kommt vom Server (partners.farbe,
// dort schon auf #rrggbb geprüft), hier zur Sicherheit noch einmal validiert. Ungültig -> kein Style,
// dann gelten die normalen Theme-Töne aus tokens.css.
function accentStyle(farbe) {
  if (!isValidHexColor(farbe)) return undefined
  return {
    '--rust': farbe,
    '--rust-deep': darkenHex(farbe),
    '--rust-wash': hexToRgba(farbe, ACCENT_WASH_ALPHA),
    '--on-rust': ON_RUST
  }
}

function asList(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []
}

// ?demo=1 geht mit, wenn das Portal selbst so geladen wurde (siehe api.publicPartners für dieselbe
// Konvention) - der Server liest demo nur aus der Query.
function demoParam(search) {
  return new URLSearchParams(search).get('demo') === '1' ? '1' : undefined
}

function NotFound({ family }) {
  return (
    <div className="public-page partner-portal-missing">
      <PublicHeader family={family} />
      <div className="card empty-state">
        <ThemeMark size={56} />
        <h1>Diesen Partner gibt es nicht</h1>
        <p className="muted">Vielleicht ist der Link veraltet, oder der Partner ist gerade pausiert.</p>
        <Link className="btn btn-primary" to="/partner">
          Zur Partnerliste
        </Link>
      </div>
      <PublicFooter />
    </div>
  )
}

// Eine öffentliche Liste des Portals (Tiere in Vermittlung, Happy Ends) - lädt unabhängig vom Partner:
// schlägt es fehl (z. B. kein Tierheim), bleibt es bei einer leeren Liste, ohne die restliche Portalseite
// zu blockieren. skip: mit eingespeisten Daten (Kundensicht) wird nichts nachgeladen.
function usePortalList(fetchList, slug, search, skip) {
  const [items, setItems] = useState([])
  useEffect(() => {
    if (skip) return undefined
    let cancelled = false
    setItems([])
    fetchList(slug, { demo: demoParam(search) })
      .then((data) => {
        if (!cancelled) setItems(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [slug, search, skip])
  return items
}

// /p/:slug – Portal eines Partners, seit Phase U als ruhige Landingpage, auf die Partner von ihrer Website,
// Instagram oder Visitenkarte verlinken: Kopf (Logo, Art · Ort, Name, Text, „Kontakt“), dann „Angebote &
// Aktuelles“ (eigene Beiträge ohne Anzeige-Badge), Einblicke, bei Tierheimen Tiere und Happy Ends, Kontakt
// (samt „Schreib uns“, Phase P2), „Gutschein einlösen“ (PortalAction) und ein dezenter Fuß. Angemeldete sehen
// dasselbe Portal, nur die Aktion ist ersetzt – man muss sich nicht abmelden, um es anzuschauen.
// Kundensicht (Phase P1): load liefert die Portal-Daten statt api.publicPartner(slug) (z. B.
// api.partnerArea.previewPortal, samt tiere) und preview schaltet Links, Einlösen und Demo-Knöpfe ab.
export default function PartnerPortalPage({ slug, family, onRedeemed, onLogout, load, preview = false }) {
  const location = useLocation()
  const injected = typeof load === 'function'
  const [partner, setPartner] = useState(undefined) // undefined: lädt, null: nicht gefunden
  const [injectedAnimals, setInjectedAnimals] = useState([])
  const [injectedPosts, setInjectedPosts] = useState([])
  const fetchedAnimals = usePortalList(api.publicPartnerAnimals, slug, location.search, injected)
  const happyEnds = usePortalList(api.publicHappyEnds, slug, location.search, injected)
  // Phase P2: Beiträge ("Aktuelles") - in der Kundensicht aus der Vorschau-Antwort (posts, samt eingereichter).
  const fetchedPosts = usePortalList(api.publicPartnerPosts, slug, location.search, injected)
  const animals = injected ? injectedAnimals : fetchedAnimals
  const posts = injected ? injectedPosts : asList(fetchedPosts)

  useEffect(() => {
    let cancelled = false
    setPartner(undefined)
    const request = injected ? Promise.resolve().then(() => load()) : api.publicPartner(slug)
    request
      .then((data) => {
        if (cancelled) return
        setPartner(data)
        if (injected) {
          setInjectedAnimals(asList(data?.tiere))
          setInjectedPosts(asList(data?.posts))
        }
      })
      .catch(() => {
        if (!cancelled) setPartner(null)
      })
    return () => {
      cancelled = true
    }
  }, [slug, load])

  if (partner === undefined) {
    return preview ? (
      <p className="muted preview-loading" role="status" aria-busy="true">
        Lädt …
      </p>
    ) : (
      <div className="splash" aria-busy="true">
        <ThemeMark size={72} />
      </div>
    )
  }

  if (partner === null) {
    return preview ? (
      <div className="error-banner" role="alert">
        {PREVIEW_LOAD_ERROR}
      </div>
    ) : (
      <NotFound family={family} />
    )
  }

  const contactId = hasPortalContact(partner) ? PORTAL_CONTACT_ID : null

  return (
    <PreviewProvider value={preview}>
      <div className="public-page partner-portal" style={accentStyle(partner.farbe)}>
        {/* Kopf mit "Zurück" nur auf der öffentlichen Seite - in der Kundensicht (preview) führte er aus der Vorschau. */}
        {!preview && <PublicHeader family={family} />}
        {partner.preview && (
          <div className="preview-banner" role="status">
            Vorschau – nur für Admins sichtbar
          </div>
        )}
        <PortalHero partner={partner} contactId={contactId} />

        <PortalPosts posts={posts} />

        <EinblickeGallery einblicke={partner.einblicke} />

        {animals.length > 0 && (
          <PortalSection id="partner-portal-animals" title={adoptionSectionTitle(animals)} className="partner-portal-animals">
            <div className="shelter-grid">
              {animals.map((animal) => (
                <AnimalAdoptionCard key={animal.slug} animal={animal} />
              ))}
            </div>
          </PortalSection>
        )}

        {happyEnds.length > 0 && (
          <PortalSection id="partner-portal-happy-ends" title="Happy Ends" className="partner-portal-animals partner-portal-happy-ends">
            <div className="shelter-grid">
              {happyEnds.map((happyEnd, index) => (
                <HappyEndCard key={`${happyEnd.name}-${index}`} happyEnd={happyEnd} />
              ))}
            </div>
          </PortalSection>
        )}

        <PortalContact partner={partner} />

        <PortalSection
          id="partner-portal-gutschein"
          title="Gutschein einlösen"
          lede={`Du hast von ${partner.name} einen Gutschein bekommen? Hier legst du deine eigene Chronik an – kostenlos.`}
          className="partner-portal-redeem"
        >
          <PortalAction partner={partner} family={family} preview={preview} onRedeemed={onRedeemed} onLogout={onLogout} />
        </PortalSection>

        <PortalBrandStrip />
        {!preview && <PublicFooter />}
      </div>
    </PreviewProvider>
  )
}
