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
import { t } from '../lib/i18n/index.js'

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

// inApp: angemeldet in der Hülle der App - deren Kopf und Fuß stehen schon da.
function NotFound({ inApp }) {
  return (
    <div className={`partner-portal-missing ${inApp ? 'partner-portal-in-app' : 'public-page'}`}>
      {!inApp && <PublicHeader />}
      <div className="card empty-state">
        <ThemeMark size={56} />
        <h1>{t('Diesen Partner gibt es nicht')}</h1>
        <p className="muted">{t('Vielleicht ist der Link veraltet, oder der Partner ist gerade pausiert.')}</p>
        <Link className="btn btn-primary" to="/partner">
          {t('Zur Partnerliste')}
        </Link>
      </div>
      {!inApp && <PublicFooter />}
    </div>
  )
}

function Loading({ preview, inApp }) {
  if (preview || inApp) {
    return (
      <p className={`muted ${preview ? 'preview-loading' : 'page-loading'}`} role="status" aria-busy="true">
        {t('Lädt …')}
      </p>
    )
  }
  return (
    <div className="splash" aria-busy="true">
      <ThemeMark size={72} />
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
// uns"), darunter Reiter statt eines langen Stapels - Übersicht, bei Tierheimen Tiere (samt Happy Ends), Angebote,
// Termine, Einblicke, Kontakt (der Partner zuerst, am Ende leise der Einladungscode), siehe PortalBody.
// Feedback-Runde: ohne Sitzung mit dem schlanken öffentlichen Kopf und einem dezenten Fuß ("Was ist Familie auf
// Pfoten?" - die Demo gibt es dort, nicht auf dem Portal). Angemeldet (inApp, App.jsx) steht das Portal in der normalen
// Hülle der App - ohne zweiten Kopf, Fuß oder Einladungscode, man muss sich nicht abmelden, um es anzuschauen.
// Kundensicht (Phase P1): load liefert die Portal-Daten statt api.publicPartner(slug) (z. B.
// api.partnerArea.previewPortal, samt tiere und posts) und preview schaltet Links und "Schreib uns" ab.
export default function PartnerPortalPage({ slug, inApp = false, load, preview = false }) {
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

  if (partner === undefined || (partner && !listsReady)) return <Loading preview={preview} inApp={inApp} />

  if (partner === null) {
    return preview ? (
      <div className="error-banner" role="alert">
        {t(PREVIEW_LOAD_ERROR)}
      </div>
    ) : (
      <NotFound inApp={inApp} />
    )
  }

  // Eigener Kopf und Fuß nur ohne Sitzung - in der Kundensicht (preview) führte "Zurück" aus der Vorschau, angemeldet
  // (inApp) stehen Kopf und Fuß der App schon da.
  const ownChrome = !preview && !inApp
  const classes = ['partner-portal', inApp ? 'partner-portal-in-app' : 'public-page', isValidHexColor(partner.farbe) && 'has-accent']

  return (
    <PreviewProvider value={preview}>
      <div className={classes.filter(Boolean).join(' ')} style={accentStyle(partner.farbe)}>
        {ownChrome && <PublicHeader />}
        {partner.preview && (
          <div className="preview-banner" role="status">
            {t('Vorschau – nur für Admins sichtbar')}
          </div>
        )}
        <PortalBody partner={partner} posts={posts} animals={animals} happyEnds={happyEnds} preview={preview} showCodeNote={!inApp} />
        {!inApp && <PortalBrandStrip />}
        {ownChrome && <PublicFooter />}
      </div>
    </PreviewProvider>
  )
}
