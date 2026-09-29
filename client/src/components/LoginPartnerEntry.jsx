import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import { usePartnerDemo } from '../hooks/usePartnerDemo.js'
import { DEMO_PARTNER_SLUGS } from '../lib/demoPartners.js'
import { PARTNER_REQUEST_ANCHOR } from '../lib/anfragen.js'

// Die beiden Demos direkt auf der Login-Seite: Hundeschule (Partner-Bereich) und Tierheim (Tiere, Steckbriefe,
// Übergabe). Weitere (Hundesalon) stehen auf /partner-werden.
const LOGIN_DEMOS = [
  { key: 'hundeschule', label: 'Demo: Hundeschule', target: { as: 'partner', slug: DEMO_PARTNER_SLUGS.hundeschule } },
  { key: 'tierheim', label: 'Demo: Tierheim', target: { as: 'tierheim' } }
]

// Zweiter Einstieg der Login-Seite (Phase U): für Hundeschulen, Tierheime & Co. - erst die Demo eines Partner-
// Bereichs (Hundeschule oder Tierheim, wie auf /partner-werden), dann "Mehr erfahren". Ein Partner-Zugang ist ein
// Gutschein: onRedeem schaltet die Karte daneben auf "Gutschein einlösen". onLogin bekommt die Demo-Sitzung.
export default function LoginPartnerEntry({ onLogin, onRedeem }) {
  const { pending, error, startDemo } = usePartnerDemo(onLogin)

  return (
    <section className="login-entry login-partner" aria-labelledby="login-partner-title">
      <div className="login-partner-head">
        <p className="login-entry-label">
          <Icon name="globe" /> Für Hundeschulen, Tierheime &amp; Co.
        </p>
        <h2 id="login-partner-title">Euer Partner-Bereich</h2>
        <p className="muted">Eigenes Profil, Beiträge in „Entdecken“, Postfach und Kunden-Gutscheine – kostenlos.</p>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <div className="login-partner-actions">
        <div className="login-partner-demos">
          {LOGIN_DEMOS.map((demo) => (
            <button
              key={demo.key}
              type="button"
              className="btn btn-ink"
              onClick={() => startDemo(demo.key, demo.target)}
              disabled={pending !== null}
            >
              {pending === demo.key ? 'Lädt …' : demo.label}
            </button>
          ))}
        </div>
        <Link to="/partner-werden" className="btn btn-ghost btn-block">
          Mehr erfahren <Icon name="arrowRight" />
        </Link>
      </div>
      <p className="field-hint">
        Partner-Zugang bekommen? Den löst ihr wie einen Gutschein ein:{' '}
        <button type="button" className="login-link-btn" onClick={onRedeem}>
          Gutschein einlösen
        </button>
      </p>
      {/* Phase N: das Anfrage-Formular steht auf der Infoseite unter #anfragen (PartnerInfoPage). */}
      <p className="field-hint">
        Noch keinen Zugang?{' '}
        <Link to={`/partner-werden#${PARTNER_REQUEST_ANCHOR}`} className="login-link-btn">
          Partner-Zugang anfragen
        </Link>
      </p>
    </section>
  )
}
