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
import { CommunityBand, useCommunity } from '../components/CommunityTicker.jsx'
import CommunityPanel from '../components/CommunityPanel.jsx'
import useMediaQuery from '../hooks/useMediaQuery.js'
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

// Wo „Mit dabei“ steht (nur EINE Stelle rendert und es wird einmal geladen): ab 1400 px als Seitenkarte links neben der
// Begrüßung (dritte Spalte der Bühne), ab 901 px quer unter den drei Stichworten - dort ist in der Bühne Platz, die Höhe
// bleibt die der Anmelde-Karte. Schmaler (Handy, Tablet hochkant) bleibt das schlanke Band unter der Kopfzeile.
const SIDE_QUERY = '(min-width: 1400px)'
const HERO_QUERY = '(min-width: 901px)'

function useCommunityPlacement() {
  const side = useMediaQuery(SIDE_QUERY)
  const hero = useMediaQuery(HERO_QUERY)
  if (side) return 'side'
  return hero ? 'hero' : 'band'
}

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
  const community = useCommunity()
  const placement = useCommunityPlacement()
  // Seitenkarte: die Spalte bleibt auch während des Ladens stehen (kein Springen der Begrüßung), fällt nur bei Fehler weg.
  const withSide = placement === 'side' && community !== null

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

  const showingKeyReveal = mode === 'redeem' && redeemResult
  const showExtras = showPartnerEntry && !showingKeyReveal

  return (
    <div className={withSide ? 'login has-side-panel' : 'login'}>
      {/* Kopfzeile: Marke links, Sprache rechts - ein Klick, und die ganze Seite wechselt. */}
      <header className="login-top">
        <span className="login-brand">
          <ThemeMark size={36} className="login-mark" />
          <span>{theme.appName}</span>
        </span>
        <div className="login-lang">
          <LanguageSwitch withIcon />
        </div>
      </header>

      {/* Band „Mit dabei“ - am Handy gleich unter der Kopfzeile, schlank, damit es ohne Scrollen zu sehen ist. */}
      {placement === 'band' && <CommunityBand data={community} fallback />}

      <section className="login-hero">
        <div className="login-hero-grid">
          {withSide && (
            <div className="login-side">
              <CommunityPanel data={community} fallback />
            </div>
          )}
          <LoginHeroText theme={theme} lang={lang} t={t}>
            {placement === 'hero' && <CommunityPanel data={community} fallback layout="row" />}
          </LoginHeroText>
          <div className="login-main">
            <OwnerCard
              mode={mode}
              partnerRedeem={partnerRedeem}
              showingKeyReveal={showingKeyReveal}
              t={t}
              onSwitch={switchMode}
              demo={{ loading: demoLoading, error: demoError, onStart: handleDemo, hint: heroDemoHint(theme, lang, t) }}
            >
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
                  <RedeemForm initialCode={redeemCode} hint={redeemHint} onRedeemed={handleRedeemed} onPartnerModeChange={setPartnerRedeem} />
                ))}
              {mode === 'recover' && <RecoverForm onBack={() => switchMode('login')} />}
            </OwnerCard>
            {/* Phase N: ohne Gutschein einen anfragen - eine ruhige Zeile unter der Karte, nicht beim Partner-Zugang. */}
            {mode !== 'recover' && !showingKeyReveal && !partnerRedeem && <LoginVoucherRequest />}
          </div>
        </div>
      </section>

      {/* Darunter zwei gleich große Karten: Partner-Einstieg und „Als App aufs Handy“ (nicht beim Einlösen auf /v). */}
      {showExtras && (
        <section className="login-more" aria-label={t('login.more')}>
          <div className="login-more-grid">
            <LoginPartnerEntry onLogin={onLogin} onRedeem={handlePartnerRedeem} />
            <InstallHint variant="card">
              <Link to="/app" className="install-hint-link">
                {t('login.installGuide')}
              </Link>
            </InstallHint>
          </div>
        </section>
      )}

      <footer className="login-footer">
        {/* Phase 5 Task 4: Infoseite für Hundeschulen, Tierheime, Hundesalons und Betreuung (PartnerInfoPage). */}
        <Link to="/partner-werden">{t('login.footer.partner')}</Link>
        {/* Phase F: „So finanzieren wir uns“ (FinanzierungPage). */}
        <Link to="/finanzierung">{t('login.footer.finance')}</Link>
        <Link to="/impressum">{t('login.footer.imprint')}</Link>
        <Link to="/datenschutz">{t('login.footer.privacy')}</Link>
      </footer>
    </div>
  )
}

// Deutsch bleibt bei den Texten des Auftritts (themes/standard.js), Englisch kommt aus dem Wörterbuch.
function heroDemoHint(theme, lang, t) {
  return lang === 'de' ? theme.texts.loginDemoHint : t('login.demoHint')
}

// Linke Spalte: Etikett, Schlagzeile (zweite Zeile in Handschrift), ein Satz und drei kurze Stichworte.
// Darunter (children) auf mittleren Breiten die Karte „Mit dabei“ quer.
function LoginHeroText({ theme, lang, t, children }) {
  const de = lang === 'de'
  const headline = de ? theme.texts.loginHeadline : tList('login.headline')
  const facts = de ? theme.texts.loginFacts : tList('login.facts')
  return (
    <div className="login-hero-inner">
      <p className="login-kicker">{de ? theme.texts.loginKicker : t('login.kicker')}</p>
      <p className="login-headline">
        {headline[0]}
        <br />
        <em>{headline[1]}</em>
      </p>
      <p className="login-lede">{de ? theme.texts.loginLede : t('login.lede')}</p>
      <ul className="login-facts">
        {facts.map(([title, sub]) => (
          <li key={title}>
            <strong>{title}</strong>
            <span>{sub}</span>
          </li>
        ))}
      </ul>
      {children}
    </div>
  )
}

// Die eine Anmelde-Karte „Für Tierhalter“: Kopf je Modus, Umschalter Anmelden | Einladungscode, das Formular
// (children) und darunter „oder Demo ansehen“.
function OwnerCard({ mode, partnerRedeem, showingKeyReveal, t, onSwitch, demo, children }) {
  const modeKey = mode === 'redeem' && partnerRedeem ? 'partnerRedeem' : mode
  const withExtras = mode !== 'recover' && !showingKeyReveal
  return (
    <section className="login-card login-entry" aria-labelledby="login-owner-label">
      <div className="login-card-head">
        <p className="login-entry-label" id="login-owner-label">
          <Icon name="paw" /> {mode === 'redeem' && partnerRedeem ? t('login.partnerAccess') : t('login.forOwners')}
        </p>
        <h1>{t(`login.mode.${modeKey}.title`)}</h1>
        <p className="muted">{t(`login.mode.${modeKey}.lede`)}</p>
      </div>
      {/* Audit V7a: nicht, solange der Schlüssel steht - der erscheint nur einmal. */}
      {withExtras && (
        <div className="segmented login-switch" role="group" aria-label={t('login.modeGroup')}>
          <button type="button" aria-pressed={mode === 'login'} onClick={() => onSwitch('login')}>
            {t('login.signIn')}
          </button>
          <button type="button" aria-pressed={mode === 'redeem'} onClick={() => onSwitch('redeem')}>
            {t('login.redeem')}
          </button>
        </div>
      )}
      {children}
      {withExtras && (
        <div className="login-demo">
          <span className="login-demo-divider">{t('login.or')}</span>
          {demo.error && (
            <div className="error-banner" role="alert">
              {demo.error}
            </div>
          )}
          <button type="button" className="btn btn-ghost btn-block" onClick={demo.onStart} disabled={demo.loading}>
            {demo.loading ? t('login.loading') : t('login.demo')}
          </button>
          <p className="field-hint">{demo.hint}</p>
        </div>
      )}
    </section>
  )
}
