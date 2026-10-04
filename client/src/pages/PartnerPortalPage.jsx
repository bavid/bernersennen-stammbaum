import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../api'
import ThemeMark from '../components/ThemeMark.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import PublicHeader from '../components/PublicHeader.jsx'
import PortalBody from '../components/PortalBody.jsx'
import PortalBrandStrip from '../components/PortalBrandStrip.jsx'
import { isValidHexColor, darkenHex, hexToRgba } from '../lib/color.js'
import { PreviewProvider } from '../lib/preview.js'

const ON_RUST = '#fffaf2'
const ACCENT_WASH_ALPHA = 0.1
const PREVIEW_LOAD_ERROR = 'Die Vorschau konnte gerade nicht geladen werden. Bitte versucht es gleich noch einmal.'
const EMPTY = Object.freeze([])
// So lange warten die Reiter höchstens auf eine Liste - hängt eine Anfrage, erscheint das Portal ohne sie (kommt sie
// später doch, füllt sie Reiter und Zähler nach).
const LIST_WAIT_MS = 4000

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

// Eine öffentliche Liste des Portals (Tiere in Vermittlung, Happy Ends, Beiträge) - lädt unabhängig vom Partner:
// schlägt es fehl (z. B. kein Tierheim), bleibt es bei einer leeren Liste, ohne die restliche Portalseite zu
// blockieren. null, solange sie lädt (die Reiter warten darauf, sonst sprängen Zähler und Reiter nach) - höchstens
// LIST_WAIT_MS lang. Abhängig nur von slug und ?demo= - ein Reiterwechsel (?reiter=) lädt nichts neu. skip: mit
// eingespeisten Daten (Kundensicht) wird nichts nachgeladen.
function usePortalList(fetchList, slug, demo, skip) {
  const [items, setItems] = useState(null)
  useEffect(() => {
    if (skip) return undefined
    let cancelled = false
    setItems(null)
    const waited = setTimeout(() => setItems((current) => current ?? EMPTY), LIST_WAIT_MS)
    fetchList(slug, { demo })
      .then((data) => {
        if (!cancelled) setItems(asList(data))
      })
      .catch(() => {
        if (!cancelled) setItems((current) => current ?? EMPTY)
      })
      .finally(() => clearTimeout(waited))
    return () => {
      cancelled = true
      clearTimeout(waited)
    }
  }, [slug, demo, skip])
  return skip ? EMPTY : items
}

// /p/:slug – Portal eines Partners, seit Phase U als ruhige Landingpage, auf die Partner von ihrer Website,
// Instagram oder Visitenkarte verlinken. Seit den Portal-Reitern: Kopf (Banner, Logo, Name, Unterzeile, "Schreib
// uns" und "Gutschein einlösen"), darunter Reiter statt eines langen Stapels - Übersicht, bei Tierheimen Tiere (samt
// Happy Ends), Angebote, Termine, Einblicke, Kontakt (samt "Gutschein einlösen"), siehe PortalBody - und ein dezenter
// Fuß. Angemeldete sehen dasselbe Portal, nur die Aktion ist ersetzt – man muss sich nicht abmelden, um es anzuschauen.
// Kundensicht (Phase P1): load liefert die Portal-Daten statt api.publicPartner(slug) (z. B.
// api.partnerArea.previewPortal, samt tiere und posts) und preview schaltet Links, Einlösen und Demo-Knöpfe ab.
export default function PartnerPortalPage({ slug, family, onRedeemed, onLogout, load, preview = false }) {
  const location = useLocation()
  const injected = typeof load === 'function'
  const demo = demoParam(location.search)
  const [partner, setPartner] = useState(undefined) // undefined: lädt, null: nicht gefunden
  const [injectedAnimals, setInjectedAnimals] = useState(EMPTY)
  const [injectedPosts, setInjectedPosts] = useState(EMPTY)
  const fetchedAnimals = usePortalList(api.publicPartnerAnimals, slug, demo, injected)
  const happyEnds = usePortalList(api.publicHappyEnds, slug, demo, injected)
  // Phase P2: Beiträge ("Aktuelles") - in der Kundensicht aus der Vorschau-Antwort (posts, samt eingereichter).
  const fetchedPosts = usePortalList(api.publicPartnerPosts, slug, demo, injected)
  const animals = injected ? injectedAnimals : fetchedAnimals
  const posts = injected ? injectedPosts : fetchedPosts
  const listsReady = [animals, happyEnds, posts].every(Array.isArray)

  useEffect(() => {
    let cancelled = false
    setPartner(undefined)
    const request = injected ? Promise.resolve().then(() => load()) : api.publicPartner(slug, { demo })
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
  }, [slug, load, demo])

  if (partner === undefined || (partner && !listsReady)) {
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

  return (
    <PreviewProvider value={preview}>
      <div className={`public-page partner-portal${isValidHexColor(partner.farbe) ? ' has-accent' : ''}`} style={accentStyle(partner.farbe)}>
        {/* Kopf mit "Zurück" nur auf der öffentlichen Seite - in der Kundensicht (preview) führte er aus der Vorschau. */}
        {!preview && <PublicHeader family={family} />}
        {partner.preview && (
          <div className="preview-banner" role="status">
            Vorschau – nur für Admins sichtbar
          </div>
        )}
        <PortalBody
          partner={partner}
          posts={posts}
          animals={animals}
          happyEnds={happyEnds}
          family={family}
          preview={preview}
          onRedeemed={onRedeemed}
          onLogout={onLogout}
        />
        <PortalBrandStrip />
        {!preview && <PublicFooter />}
      </div>
    </PreviewProvider>
  )
}
