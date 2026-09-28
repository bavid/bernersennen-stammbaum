import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import ThemeMark from '../components/ThemeMark.jsx'
import RedeemForm from '../components/RedeemForm.jsx'
import KeyReveal from '../components/KeyReveal.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import Icon from '../components/Icon.jsx'
import { startRoute } from '../lib/areas.js'
import { isValidHexColor, darkenHex, hexToRgba } from '../lib/color.js'
import { isExternalUrl } from '../lib/format.js'
import { TYPE_LABELS } from '../lib/partnerTypes.js'

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
  const [partner, setPartner] = useState(undefined) // undefined: lädt, null: nicht gefunden
  const [redeemResult, setRedeemResult] = useState(null)

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

  function handleRedeemed(response) {
    const { key, fromOthers, ...me } = response
    setRedeemResult({ key, me })
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
          <RedeemForm onRedeemed={handleRedeemed} />
        )}
      </section>

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
