import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../api'
import ThemeMark from '../components/ThemeMark.jsx'
import AnimalAdoptionCard from '../components/AnimalAdoptionCard.jsx'
import HappyEndCard from '../components/HappyEndCard.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import Icon from '../components/Icon.jsx'
import PortalAction from '../components/PortalAction.jsx'
import PortalContact from '../components/PortalContact.jsx'
import EinblickeGallery from '../components/EinblickeGallery.jsx'
import { ExternalLink } from '../components/PreviewLink.jsx'
import { isValidHexColor, darkenHex, hexToRgba } from '../lib/color.js'
import { isExternalUrl } from '../lib/format.js'
import { PreviewProvider } from '../lib/preview.js'
import { TYPE_LABELS } from '../lib/partnerTypes.js'
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

// portal_text ist reiner Text (nie HTML) - Absätze trennt eine Leerzeile.
function paragraphsOf(text) {
  return (text || '')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function asList(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []
}

// ?demo=1 geht mit, wenn das Portal selbst so geladen wurde (siehe api.publicPartners für dieselbe
// Konvention) - der Server liest demo nur aus der Query.
function demoParam(search) {
  return new URLSearchParams(search).get('demo') === '1' ? '1' : undefined
}

function NotFound() {
  return (
    <div className="public-page partner-portal-missing">
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

// /p/:slug – Portal eines Partners: Logo/Akzentfarbe, Willkommenstext, „Gutschein einlösen" (PortalAction)
// und Links zu Spenden/Vermittlung, dazu Tiere, Happy Ends und Einblicke. Angemeldete sehen dasselbe
// Portal, nur die Aktion ist ersetzt – man muss sich nicht abmelden, um es anzuschauen.
// Kundensicht (Phase P1): load liefert die Portal-Daten statt api.publicPartner(slug) (z. B.
// api.partnerArea.previewPortal, samt tiere) und preview schaltet Links, Einlösen und Demo-Knöpfe ab.
export default function PartnerPortalPage({ slug, family, onRedeemed, onLogout, load, preview = false }) {
  const location = useLocation()
  const injected = typeof load === 'function'
  const [partner, setPartner] = useState(undefined) // undefined: lädt, null: nicht gefunden
  const [injectedAnimals, setInjectedAnimals] = useState([])
  const fetchedAnimals = usePortalList(api.publicPartnerAnimals, slug, location.search, injected)
  const happyEnds = usePortalList(api.publicHappyEnds, slug, location.search, injected)
  const animals = injected ? injectedAnimals : fetchedAnimals

  useEffect(() => {
    let cancelled = false
    setPartner(undefined)
    const request = injected ? Promise.resolve().then(() => load()) : api.publicPartner(slug)
    request
      .then((data) => {
        if (cancelled) return
        setPartner(data)
        if (injected) setInjectedAnimals(asList(data?.tiere))
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
      <NotFound />
    )
  }

  const typeLabel = TYPE_LABELS[partner.typ] || partner.typ

  return (
    <PreviewProvider value={preview}>
      <div className="public-page partner-portal" style={accentStyle(partner.farbe)}>
        {partner.preview && (
          <div className="preview-banner" role="status">
            Vorschau – nur für Admins sichtbar
          </div>
        )}
        <header className="partner-portal-hero">
          <div className="partner-portal-marks">
            <ThemeMark size={56} className="partner-portal-mark" />
            {partner.logoUrl && <img src={partner.logoUrl} alt={`Logo von ${partner.name}`} className="partner-logo" />}
          </div>
          <span className="eyebrow">{typeLabel}</span>
          <h1>{partner.portal_titel || `Willkommen von ${partner.name}`}</h1>
          {paragraphsOf(partner.portal_text).map((paragraph, index) => (
            <p key={index} className="partner-portal-text">
              {paragraph}
            </p>
          ))}
          {(isExternalUrl(partner.spenden_url) || isExternalUrl(partner.vermittlung_url)) && (
            <div className="partner-portal-links">
              {isExternalUrl(partner.spenden_url) && (
                <ExternalLink href={partner.spenden_url} className="btn btn-ghost">
                  <Icon name="heart" /> Spenden an {partner.name}
                </ExternalLink>
              )}
              {isExternalUrl(partner.vermittlung_url) && (
                <ExternalLink href={partner.vermittlung_url} className="btn btn-ghost">
                  Tiere in Vermittlung
                </ExternalLink>
              )}
            </div>
          )}
        </header>

        <PortalAction partner={partner} family={family} preview={preview} onRedeemed={onRedeemed} onLogout={onLogout} />

        {animals.length > 0 && (
          <section className="partner-portal-animals">
            <h2>{adoptionSectionTitle(animals)}</h2>
            <div className="shelter-grid">
              {animals.map((animal) => (
                <AnimalAdoptionCard key={animal.slug} animal={animal} />
              ))}
            </div>
          </section>
        )}

        {happyEnds.length > 0 && (
          <section className="partner-portal-animals partner-portal-happy-ends">
            <h2>Happy Ends</h2>
            <div className="shelter-grid">
              {happyEnds.map((happyEnd, index) => (
                <HappyEndCard key={`${happyEnd.name}-${index}`} happyEnd={happyEnd} />
              ))}
            </div>
          </section>
        )}

        <EinblickeGallery einblicke={partner.einblicke} />

        <PortalContact partner={partner} />

        {!preview && <PublicFooter />}
      </div>
    </PreviewProvider>
  )
}
