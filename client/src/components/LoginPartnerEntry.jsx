import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import { usePartnerDemo } from '../hooks/usePartnerDemo.js'
import { DEMO_PARTNER_SLUGS } from '../lib/demoPartners.js'

const DEMO_KEY = 'hundeschule'

// Zweiter Einstieg der Login-Seite (Phase U): für Hundeschulen, Tierheime & Co. - erst die Demo eines Partner-
// Bereichs (Demo-Hundeschule, wie auf /partner-werden), dann "Mehr erfahren". Ein Partner-Zugang ist ein
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
        <button
          type="button"
          className="btn btn-ink btn-block"
          onClick={() => startDemo(DEMO_KEY, DEMO_PARTNER_SLUGS.hundeschule)}
          disabled={pending !== null}
        >
          {pending ? 'Lädt …' : 'Demo als Partner ansehen'}
        </button>
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
    </section>
  )
}
