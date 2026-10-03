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
import { isPartnerArea } from '../lib/areas.js'

const REDEEM_HINT = 'Das ist ein Gutschein – löst ihn ein, um eure Chronik anzulegen.'

// Nach einem Partner-Zugang (Phase P) öffnet der Schlüssel den Partner-Bereich, nicht "Meine Chronik" -
// und erneuert wird er dort unter "Zugang", nicht in den Familien-Einstellungen am Stammbaum.
const PARTNER_KEY_REVEAL = {
  continueLabel: 'Weiter zum Partner-Bereich',
  showCardHint: false,
  note: 'Wer euch den Zugang gegeben hat, kennt diesen Code. Erneuert den Schlüssel später unter „Zugang“, wenn ihr sicher gehen wollt.'
}

function keyRevealProps(me) {
  return isPartnerArea(me) ? PARTNER_KEY_REVEAL : {}
}

// Kopf der Anmelde-Karte je Modus. Über der Überschrift steht nur das Etikett des Einstiegs ("Für Tierhalter" bzw.
// "Partner-Zugang") - wie im Partner-Einstieg daneben, ohne zweite Zeile darüber (Phase U, ruhiger).
const MODE_COPY = {
  login: { title: 'Anmelden', lede: 'Mit eurem Schlüssel oder Passwort geht’s weiter.' },
  redeem: {
    title: 'Gutschein einlösen',
    lede: 'Löst euren Gutschein ein und legt eure Chronik an.'
  },
  // Einlöse-Modus mit einem Partner-Zugang (RedeemForm meldet es über onPartnerModeChange, Phase P).
  partnerRedeem: {
    title: 'Gutschein einlösen',
    lede: 'Löst euren Partner-Zugang ein und richtet euer Partner-Profil ein.'
  },
  recover: {
    title: 'Passwort wiederherstellen',
    lede: 'Mit eurem Schlüssel setzt ihr ein neues Passwort.'
  }
}

// Zwei Einstiege nebeneinander (am Handy untereinander, Phase U): "Für Tierhalter" mit Anmelden, Gutschein,
// Demo und "Noch keinen Gutschein?" (Phase N, LoginVoucherRequest), daneben "Für Hundeschulen, Tierheime & Co." (LoginPartnerEntry) mit Partner-Demo und "Mehr erfahren".
// Auf /v (initialMode 'redeem': Gutschein-Link, "Eigene Familie anlegen" aus der Demo) geht es ums Einlösen - dort
// bleibt der Partner-Einstieg weg.
export default function LoginPage({ onLogin, initialMode = 'login', initialCode = '' }) {
  const { theme } = useTheme()
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
    setRedeemHint(REDEEM_HINT)
    setMode('redeem')
  }

  function handleRedeemed(response) {
    const { key, fromOthers, ...me } = response
    setRedeemResult({ key, me })
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

  const copy = MODE_COPY[mode === 'redeem' && partnerRedeem ? 'partnerRedeem' : mode]
  const showingKeyReveal = mode === 'redeem' && redeemResult

  return (
    <div className="login">
      <section className="login-hero">
        <div className="login-hero-inner">
          <ThemeMark size={88} className="login-mark" />
          <p className="login-kicker">{theme.texts.loginKicker}</p>
          <p className="login-headline">
            {theme.texts.loginHeadline[0]}
            <br />
            <em>{theme.texts.loginHeadline[1]}</em>
          </p>
          <p className="login-lede">{theme.texts.loginLede}</p>
          <ul className="login-facts">
            {theme.texts.loginFacts.map(([title, sub]) => (
              <li key={title}>
                <strong>{title}</strong>
                <span>{sub}</span>
              </li>
            ))}
          </ul>
        </div>
        {theme.tricolor && <div className="tricolor tricolor-vertical" />}
      </section>

      <section className="login-panel">
        <div className="login-entries">
          <section className="login-card login-entry" aria-labelledby="login-owner-label">
            <div className="login-card-head">
              <p className="login-entry-label" id="login-owner-label">
                <Icon name="paw" /> {mode === 'redeem' && partnerRedeem ? 'Partner-Zugang' : 'Für Tierhalter'}
              </p>
              <h1>{copy.title}</h1>
              <p className="muted">{copy.lede}</p>
            </div>

            {mode !== 'recover' && (
              <div className="segmented login-switch" role="group" aria-label="Modus">
                <button type="button" aria-pressed={mode === 'login'} onClick={() => switchMode('login')}>
                  Anmelden
                </button>
                <button type="button" aria-pressed={mode === 'redeem'} onClick={() => switchMode('redeem')}>
                  Gutschein einlösen
                </button>
              </div>
            )}

            {mode === 'login' && (
              <LoginForm onLogin={onLogin} onRedeemRequired={handleRedeemRequired} onForgot={() => switchMode('recover')} />
            )}

            {mode === 'redeem' &&
              (redeemResult ? (
                <KeyReveal value={redeemResult.key} onContinue={() => onLogin(redeemResult.me)} {...keyRevealProps(redeemResult.me)} />
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
                <span className="login-demo-divider">oder</span>
                {demoError && (
                  <div className="error-banner" role="alert">
                    {demoError}
                  </div>
                )}
                <button type="button" className="btn btn-ghost btn-block" onClick={handleDemo} disabled={demoLoading}>
                  {demoLoading ? 'Lädt …' : 'Demo ansehen'}
                </button>
                {/* Phase V3: je Auftritt (Standard: Familien statt Generationen) */}
                <p className="field-hint">{theme.texts.loginDemoHint}</p>
              </div>
            )}

            {/* Phase N: ohne Gutschein einen anfragen - nicht beim Einlösen eines Partner-Zugangs. */}
            {mode !== 'recover' && !showingKeyReveal && !partnerRedeem && <LoginVoucherRequest />}
          </section>
          {showPartnerEntry && !showingKeyReveal && <LoginPartnerEntry onLogin={onLogin} onRedeem={handlePartnerRedeem} />}
        </div>
      </section>

      <footer className="login-footer">
        {/* Phase 5 Task 4: Infoseite für Hundeschulen, Tierheime, Hundesalons und Betreuung (PartnerInfoPage). */}
        <Link to="/partner-werden">Für Partner</Link>
        <Link to="/impressum">Impressum</Link>
        <Link to="/datenschutz">Datenschutz</Link>
      </footer>
    </div>
  )
}
