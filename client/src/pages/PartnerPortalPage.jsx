import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import ThemeMark from '../components/ThemeMark.jsx'
import RedeemForm from '../components/RedeemForm.jsx'
import KeyReveal from '../components/KeyReveal.jsx'
import AnimalAdoptionCard from '../components/AnimalAdoptionCard.jsx'
import HappyEndCard from '../components/HappyEndCard.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import Icon from '../components/Icon.jsx'
import { startRoute } from '../lib/areas.js'
import { isValidHexColor, darkenHex, hexToRgba } from '../lib/color.js'
import { isExternalUrl } from '../lib/format.js'
import { TYPE_LABELS } from '../lib/partnerTypes.js'
import { adoptionSectionTitle } from '../lib/shelter.js'

const ON_RUST = '#fffaf2'
const ACCENT_WASH_ALPHA = 0.1

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

// /p/:slug – Portal eines Partners: Logo/Akzentfarbe, Willkommenstext, „Gutschein einlösen" (wie /v,
// aber der Partner steckt bereits im Code) und Links zu Spenden/Vermittlung. Angemeldete sehen dasselbe
// Portal, nur die Aktion ist ersetzt (siehe unten) – man muss sich nicht abmelden, um es anzuschauen.
export default function PartnerPortalPage({ slug, family, onRedeemed, onLogout }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [partner, setPartner] = useState(undefined) // undefined: lädt, null: nicht gefunden
  const [animals, setAnimals] = useState([])
  const [happyEnds, setHappyEnds] = useState([])
  const [redeemResult, setRedeemResult] = useState(null)
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoError, setDemoError] = useState(null)
  const [shelterDemoLoading, setShelterDemoLoading] = useState(false)
  const [shelterDemoError, setShelterDemoError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setPartner(undefined)
    setRedeemResult(null)
    api
      .publicPartner(slug)
      .then((data) => {
        if (!cancelled) setPartner(data)
      })
      .catch(() => {
        if (!cancelled) setPartner(null)
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  // Tiere in Vermittlung für die Sektion "Fellnasen/Tiere suchen ein Zuhause" (Task 5) - unabhängig vom
  // Partner-Fetch oben: schlägt es fehl (z. B. kein Tierheim), bleibt es bei einer leeren Liste, ohne
  // die restliche Portalseite zu blockieren. ?demo=1 geht mit, wenn das Portal selbst so geladen wurde
  // (siehe api.publicPartners für dieselbe Konvention) - der Server liest demo nur aus der Query.
  useEffect(() => {
    let cancelled = false
    setAnimals([])
    const demo = new URLSearchParams(location.search).get('demo') === '1' ? '1' : undefined
    api
      .publicPartnerAnimals(slug, { demo })
      .then((data) => {
        if (!cancelled) setAnimals(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [slug, location.search])

  // Happy Ends (Task 6) - unabhängig vom Tiere-Fetch oben, gleiche demo-Konvention. Schlägt es fehl
  // (z. B. kein Tierheim), bleibt es bei einer leeren Liste, ohne die restliche Portalseite zu blockieren.
  useEffect(() => {
    let cancelled = false
    setHappyEnds([])
    const demo = new URLSearchParams(location.search).get('demo') === '1' ? '1' : undefined
    api
      .publicHappyEnds(slug, { demo })
      .then((data) => {
        if (!cancelled) setHappyEnds(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [slug, location.search])

  function handleRedeemed(response) {
    const { key, fromOthers, ...me } = response
    setRedeemResult({ key, me })
  }

  // Wie der Demo-Knopf der Login-Seite (LoginPage.jsx handleDemo): api.demo() -> onRedeemed (=
  // handleVoucherLogin in App.jsx: setFamily + navigate(startRoute(me))) - keine eigene Navigation hier.
  async function handleDemo() {
    setDemoError(null)
    setDemoLoading(true)
    try {
      onRedeemed(await api.demo())
    } catch (err) {
      setDemoError(err.message)
      setDemoLoading(false)
    }
  }

  // "Demo als Tierheim ansehen" (Task 6): derselbe Ablauf wie handleDemo, nur mit { as: 'tierheim' } -
  // nur sichtbar, wenn der Server diesen Partner als demo-fähig meldet (partner.shelterDemo, siehe unten
  // - final-review Phase T Finding 5: das gilt nur, wenn tatsächlich ein Demo-Tierheim existiert, sonst
  // liefe der Knopf ins Leere).
  async function handleShelterDemo() {
    setShelterDemoError(null)
    setShelterDemoLoading(true)
    try {
      onRedeemed(await api.demo({ as: 'tierheim' }))
    } catch (err) {
      setShelterDemoError(err.message)
      setShelterDemoLoading(false)
    }
  }

  if (partner === undefined) {
    return (
      <div className="splash" aria-busy="true">
        <ThemeMark size={72} />
      </div>
    )
  }

  if (partner === null) return <NotFound />

  const typeLabel = TYPE_LABELS[partner.typ] || partner.typ

  return (
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
              <a href={partner.spenden_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
                <Icon name="heart" /> Spenden an {partner.name}
              </a>
            )}
            {isExternalUrl(partner.vermittlung_url) && (
              <a href={partner.vermittlung_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
                Tiere in Vermittlung
              </a>
            )}
          </div>
        )}
      </header>

      <section className="card partner-portal-action">
        {family ? (
          <>
            <p>
              Ihr seid angemeldet als <strong>{family.name}</strong>.
            </p>
            <button type="button" className="btn btn-primary btn-block" onClick={() => navigate(startRoute(family))}>
              Zurück zu eurer Chronik
            </button>
            <p className="field-hint">Um einen Gutschein einzulösen, meldet euch zuerst ab.</p>
            <button type="button" className="btn btn-ghost btn-block" onClick={onLogout}>
              Abmelden und Gutschein einlösen
            </button>
          </>
        ) : redeemResult ? (
          <KeyReveal value={redeemResult.key} onContinue={() => onRedeemed(redeemResult.me)} />
        ) : (
          <>
            <RedeemForm onRedeemed={handleRedeemed} />
            <div className="login-demo">
              <span className="login-demo-divider">oder</span>
              {demoError && (
                <div className="error-banner" role="alert">
                  {demoError}
                </div>
              )}
              <button type="button" className="btn btn-ghost btn-block" onClick={handleDemo} disabled={demoLoading}>
                {demoLoading ? 'Lädt …' : 'Demo ansehen'}
              </button>
              {partner.shelterDemo && (
                <>
                  {shelterDemoError && (
                    <div className="error-banner" role="alert">
                      {shelterDemoError}
                    </div>
                  )}
                  <button type="button" className="btn btn-ghost btn-block" onClick={handleShelterDemo} disabled={shelterDemoLoading}>
                    {shelterDemoLoading ? 'Lädt …' : 'Demo als Tierheim ansehen'}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </section>

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

      {(isExternalUrl(partner.website) || partner.kontakt_email || partner.kontakt_telefon) && (
        <section className="card partner-portal-contact">
          <h2>Kontakt</h2>
          <ul>
            {isExternalUrl(partner.website) && (
              <li>
                <Icon name="globe" />
                <a href={partner.website} target="_blank" rel="noopener noreferrer">
                  {partner.website}
                </a>
              </li>
            )}
            {partner.kontakt_email && (
              <li>
                <Icon name="mail" />
                <a href={`mailto:${partner.kontakt_email}`}>{partner.kontakt_email}</a>
              </li>
            )}
            {partner.kontakt_telefon && (
              <li>
                <Icon name="phone" />
                <span>{partner.kontakt_telefon}</span>
              </li>
            )}
          </ul>
        </section>
      )}

      <PublicFooter />
    </div>
  )
}
