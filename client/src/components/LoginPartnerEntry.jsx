import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import { usePartnerDemo } from '../hooks/usePartnerDemo.js'
import { DEMO_PARTNER_SLUGS } from '../lib/demoPartners.js'
import { PARTNER_REQUEST_ANCHOR } from '../lib/anfragen.js'
import { useT } from '../lib/i18n/index.js'
import { Button } from './ui/index.js'

// Die beiden Demos direkt auf der Login-Seite: Hundeschule (Partner-Bereich) und Tierheim (Tiere, Steckbriefe,
// Übergabe). Weitere (Hundesalon) stehen auf /partner-werden.
const LOGIN_DEMOS = [
  { key: 'hundeschule', labelKey: 'login.partner.demoSchool', target: { as: 'partner', slug: DEMO_PARTNER_SLUGS.hundeschule } },
  { key: 'tierheim', labelKey: 'login.partner.demoShelter', target: { as: 'tierheim' } }
]

// Zweiter Einstieg der Login-Seite (Phase U): für Hundeschulen, Tierheime & Co. - erst die Demo eines Partner-
// Bereichs (Hundeschule oder Tierheim, wie auf /partner-werden), dann "Mehr erfahren". Ein Partner-Zugang ist ein
// Gutschein: onRedeem schaltet die Karte daneben auf "Gutschein einlösen". onLogin bekommt die Demo-Sitzung.
export default function LoginPartnerEntry({ onLogin, onRedeem }) {
  const t = useT()
  const { pending, error, startDemo } = usePartnerDemo(onLogin)

  return (
    <section className="login-entry login-partner" aria-labelledby="login-partner-title">
      <div className="login-partner-head">
        <p className="login-entry-label">
          <Icon name="globe" /> {t('login.partner.label')}
        </p>
        <h2 id="login-partner-title">{t('login.partner.title')}</h2>
        <p className="muted">{t('login.partner.lede')}</p>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <div className="login-partner-actions">
        <div className="login-partner-demos">
          {LOGIN_DEMOS.map((demo) => (
            <Button
              key={demo.key}
              type="button"
              variant="ink"
              onClick={() => startDemo(demo.key, demo.target)}
              disabled={pending !== null}
            >
              {pending === demo.key ? t('login.loading') : t(demo.labelKey)}
            </Button>
          ))}
        </div>
        <Button to="/partner-werden" as={Link} variant="ghost" block>
          {t('login.partner.more')} <Icon name="arrowRight" />
        </Button>
      </div>
      <p className="field-hint">
        {t('login.partner.gotAccess')}{' '}
        <button type="button" className="login-link-btn" onClick={onRedeem}>
          {t('login.redeem')}
        </button>
      </p>
      {/* Phase N: das Anfrage-Formular steht auf der Infoseite unter #anfragen (PartnerInfoPage). */}
      <p className="field-hint">
        {t('login.partner.noAccess')}{' '}
        <Link to={`/partner-werden#${PARTNER_REQUEST_ANCHOR}`} className="login-link-btn">
          {t('login.partner.request')}
        </Link>
      </p>
    </section>
  )
}
