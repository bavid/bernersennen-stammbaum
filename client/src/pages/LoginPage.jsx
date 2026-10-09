import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import ThemeMark from '../components/ThemeMark.jsx'
import Icon from '../components/Icon.jsx'
import LoginForm from '../components/LoginForm.jsx'
import LoginPartnerEntry from '../components/LoginPartnerEntry.jsx'
import LoginVoucherRequest from '../components/LoginVoucherRequest.jsx'
import RedeemForm from '../components/RedeemForm.jsx'
import RecoverForm from '../components/RecoverForm.jsx'
import KeyReveal from '../components/KeyReveal.jsx'
import InstallHint from '../components/InstallHint.jsx'
import CommunityTicker from '../components/CommunityTicker.jsx'
import { isPartnerArea } from '../lib/areas.js'
import { useLang, useT, tList } from '../lib/i18n/index.js'
import LanguageSwitch from '../components/LanguageSwitch.jsx'

// Nach einem Partner-Zugang (Phase P) öffnet der Schlüssel den Partner-Bereich, nicht "Meine Chronik" -
// und erneuert wird er dort unter "Zugang", nicht in den Familien-Einstellungen am Stammbaum.
function keyRevealProps(me, t) {
  if (!isPartnerArea(me)) return {}
  return { continueLabel: t('login.keyReveal.partnerContinue'), showCardHint: false, note: t('login.keyReveal.partnerNote') }
}

// Kopf der Anmelde-Karte je Modus. Über der Überschrift steht nur das Etikett des Einstiegs ("Für Tierhalter" bzw.
// "Partner-Zugang") - wie im Partner-Einstieg daneben, ohne zweite Zeile darüber (Phase U, ruhiger).
// Die Texte stehen unter 'login.mode.<Modus>.title' und '.lede' (lib/i18n/login.js); partnerRedeem: Einlöse-Modus mit einem
// Partner-Zugang (RedeemForm meldet es über onPartnerModeChange, Phase P).

// Zwei Einstiege nebeneinander (am Handy untereinander, Phase U): "Für Tierhalter" mit Anmelden, Gutschein,
// Demo und "Noch keinen Gutschein?" (Phase N, LoginVoucherRequest), daneben "Für Hundeschulen, Tierheime & Co." (LoginPartnerEntry) mit Partner-Demo und "Mehr erfahren".
// Auf /v (initialMode 'redeem': Gutschein-Link, "Eigene Familie anlegen" aus der Demo) geht es ums Einlösen - dort
// bleibt der Partner-Einstieg weg.
export default function LoginPage({ onLogin, initialMode = 'login', initialCode = '' }) {
  const { theme } = useTheme()
  const t = useT()
  const lang = useLang()
  const showPartnerEntry = initialMode !== 'redeem'
  const [mode, setMode] = useState(initialMode)
  const [redeemCode, setRedeemCode] = useState(initialCode)
  const [redeemHint, setRedeemHint] = useState(null)
  const [redeemResult, setRedeemResult] = useState(null)
  const [partnerRedeem, setPartnerRedeem] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoError, setDemoError] = useState(null)

  // Derselbe Modus noch einmal (z. B. "Gutschein einlösen" im Einlöse-Modus) setzt nichts zurück - sonst ginge die
  // Erkennung eines Partner-Zugangs (partnerRedeem) verloren, ohne dass RedeemForm sie neu meldet.
  function switchMode(next) {
    if (next === mode) return
    setMode(next)
    setRedeemHint(null)
    setRedeemResult(null)
    setPartnerRedeem(false)
  }

  function handleRedeemRequired(secret) {
    setRedeemCode(secret)
    setRedeemHint(t('login.redeemHint'))
    setMode('redeem')
  }

  function handleRedeemed(response) {
    const { key, fromOthers, ...me } = response
    setRedeemResult({ key, freshKey: fromOthers === false, me })
  }

  // "Gutschein einlösen" aus dem Partner-Einstieg: ein Partner-Zugang ist ein Gutschein - also die Karte daneben
  // (am Handy darüber) umschalten. Beim Einblenden fokussiert RedeemForm sein Code-Feld selbst (autoFocus, der
  // Browser holt es dabei ins Bild); ist es schon offen, genügt der Fokus.
  function handlePartnerRedeem() {
    if (mode !== 'redeem') switchMode('redeem')
    else document.getElementById('redeem-code')?.focus()
  }

  async function handleDemo() {
    setDemoError(null)
    setDemoLoading(true)
    try {
      onLogin(await api.demo())
    } catch (err) {
      setDemoError(err.message)
      setDemoLoading(false)
    }
  }

  const modeKey = mode === 'redeem' && partnerRedeem ? 'partnerRedeem' : mode
  // Deutsch bleibt bei den Texten des Auftritts (themes/standard.js), Englisch kommt aus dem Wörterbuch.
  const heroText = (name, key) => (lang === 'de' ? theme.texts[name] : t(key))
  const headline = lang === 'de' ? theme.texts.loginHeadline : tList('login.headline')
  const facts = lang === 'de' ? theme.texts.loginFacts : tList('login.facts')
  const showingKeyReveal = mode === 'redeem' && redeemResult

  return (
    <div className="login">
      <section className="login-hero">
        <div className="login-hero-inner">
          <ThemeMark size={88} className="login-mark" />
          <p className="login-kicker">{heroText('loginKicker', 'login.kicker')}</p>
          <p className="login-headline">
            {headline[0]}
            <br />
            <em>{headline[1]}</em>
          </p>
          <p className="login-lede">{heroText('loginLede', 'login.lede')}</p>
          <ul className="login-facts">
            {facts.map(([title, sub]) => (
              <li key={title}>
                <strong>{title}</strong>
                <span>{sub}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-entries">
          <section className="login-card login-entry" aria-labelledby="login-owner-label">
            <div className="login-card-head">
              <p className="login-entry-label" id="login-owner-label">
                <Icon name="paw" /> {mode === 'redeem' && partnerRedeem ? t('login.partnerAccess') : t('login.forOwners')}
              </p>
              <h1>{t(`login.mode.${modeKey}.title`)}</h1>
              <p className="muted">{t(`login.mode.${modeKey}.lede`)}</p>
            </div>

            {/* Audit V7a: nicht, solange der Schlüssel steht - der erscheint nur einmal, ein Klick auf „Anmelden“ hätte
                ihn ungesichert weggeräumt (angemeldet ist man da schon). */}
            {mode !== 'recover' && !showingKeyReveal && (
              <div className="segmented login-switch" role="group" aria-label={t('login.modeGroup')}>
                <button type="button" aria-pressed={mode === 'login'} onClick={() => switchMode('login')}>
                  {t('login.signIn')}
                </button>
                <button type="button" aria-pressed={mode === 'redeem'} onClick={() => switchMode('redeem')}>
                  {t('login.redeem')}
                </button>
              </div>
            )}

            {mode === 'login' && (
              <LoginForm onLogin={onLogin} onRedeemRequired={handleRedeemRequired} onForgot={() => switchMode('recover')} />
            )}

            {mode === 'redeem' &&
              (redeemResult ? (
                <KeyReveal
                  value={redeemResult.key}
                  freshKey={redeemResult.freshKey}
                  onContinue={() => onLogin(redeemResult.me)}
                  {...keyRevealProps(redeemResult.me, t)}
                />
              ) : (
                <RedeemForm
                  initialCode={redeemCode}
                  hint={redeemHint}
                  onRedeemed={handleRedeemed}
                  onPartnerModeChange={setPartnerRedeem}
                />
              ))}

            {mode === 'recover' && <RecoverForm onBack={() => switchMode('login')} />}

            {mode !== 'recover' && !showingKeyReveal && (
              <div className="login-demo">
                <span className="login-demo-divider">{t('login.or')}</span>
                {demoError && (
                  <div className="error-banner" role="alert">
                    {demoError}
                  </div>
                )}
                <button type="button" className="btn btn-ghost btn-block" onClick={handleDemo} disabled={demoLoading}>
                  {demoLoading ? t('login.loading') : t('login.demo')}
                </button>
                {/* Phase V3: je Auftritt (Standard: Familien statt Generationen) */}
                <p className="field-hint">{heroText('loginDemoHint', 'login.demoHint')}</p>
              </div>
            )}

            {/* Phase N: ohne Gutschein einen anfragen - nicht beim Einlösen eines Partner-Zugangs. */}
            {mode !== 'recover' && !showingKeyReveal && !partnerRedeem && <LoginVoucherRequest />}
          </section>
          {showPartnerEntry && !showingKeyReveal && <LoginPartnerEntry onLogin={onLogin} onRedeem={handlePartnerRedeem} />}
        </div>
        {/* „Als App aufs Handy – ohne App Store“: eine ruhige Karte unter den Einstiegen (nicht beim Einlösen auf /v). */}
        {showPartnerEntry && !showingKeyReveal && (
          <div className="login-install">
            <InstallHint variant="card">
              <Link to="/app" className="install-hint-link">
                {t('login.installGuide')}
              </Link>
            </InstallHint>
          </div>
        )}
      </section>

      {/* Laufband „Zahlen aus der Gemeinschaft“ - unten über dem Fuß, damit der schlanke Streifen oben schlank bleibt. */}
      <CommunityTicker fallback />

      <footer className="login-footer">
        {/* Phase 5 Task 4: Infoseite für Hundeschulen, Tierheime, Hundesalons und Betreuung (PartnerInfoPage). */}
        <Link to="/partner-werden">{t('login.footer.partner')}</Link>
        {/* Phase F: „So finanzieren wir uns“ (FinanzierungPage) - eine kleine Zeile unten, wie die anderen. */}
        <Link to="/finanzierung">{t('login.footer.finance')}</Link>
        <Link to="/impressum">{t('login.footer.imprint')}</Link>
        <Link to="/datenschutz">{t('login.footer.privacy')}</Link>
        <LanguageSwitch compact />
      </footer>
    </div>
  )
}
