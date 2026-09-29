import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import ThemeMark from '../components/ThemeMark.jsx'
import PasswordField from '../components/PasswordField.jsx'
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

const MODE_COPY = {
  login: { eyebrow: 'Willkommen zurück', title: 'Anmelden', lede: 'Mit eurem Schlüssel oder Passwort geht’s weiter.' },
  redeem: {
    eyebrow: 'Neue Chronik',
    title: 'Gutschein einlösen',
    lede: 'Löst euren Gutschein ein und legt eure Chronik an.'
  },
  // Einlöse-Modus mit einem Partner-Zugang (RedeemForm meldet es über onPartnerModeChange, Phase P).
  partnerRedeem: {
    eyebrow: 'Partner-Profil einrichten',
    title: 'Gutschein einlösen',
    lede: 'Löst euren Partner-Zugang ein und richtet euer Partner-Profil ein.'
  },
  recover: {
    eyebrow: 'Passwort vergessen',
    title: 'Passwort wiederherstellen',
    lede: 'Mit eurem Schlüssel setzt ihr ein neues Passwort.'
  }
}

// Anmelden per Schlüssel (Standardfall) oder – aufklappbar – per Benutzername/Passwort. Ein offener
// Gutschein im Schlüsselfeld beantwortet der Server mit 409 { redeem: true }: onRedeemRequired wechselt
// dann in den Einlöse-Modus, statt nur einen Fehler zu zeigen.
function LoginForm({ onLogin, onRedeemRequired, onForgot }) {
  const [useUsername, setUseUsername] = useState(false)
  const [secret, setSecret] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  function toggleUsername() {
    setUseUsername((prev) => !prev)
    setError(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const me = useUsername ? await api.loginUser(username, password) : await api.login(secret)
      onLogin(me)
    } catch (err) {
      if (!useUsername && err.status === 409 && err.details?.redeem) {
        onRedeemRequired(secret)
        return
      }
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {useUsername ? (
        <>
          <div className="field">
            <label className="field-label" htmlFor="login-username">
              Benutzername
            </label>
            <input
              id="login-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </div>
          <PasswordField
            id="login-user-password"
            label="Passwort"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />
        </>
      ) : (
        <PasswordField
          id="login-secret"
          label="Schlüssel oder Passwort"
          value={secret}
          onChange={setSecret}
          autoFocus
          autoComplete="current-password"
        />
      )}
      <button
        className="btn btn-primary btn-lg btn-block"
        type="submit"
        disabled={loading || (useUsername ? !username || !password : !secret)}
      >
        {loading ? 'Öffne Chronik …' : 'Chronik öffnen'}
      </button>
      <div className="login-links">
        <button type="button" className="login-link-btn" onClick={toggleUsername}>
          {useUsername ? 'Mit Schlüssel anmelden' : 'Mit Benutzername anmelden'}
        </button>
        <button type="button" className="login-link-btn" onClick={onForgot}>
          Passwort vergessen?
        </button>
      </div>
    </form>
  )
}

export default function LoginPage({ onLogin, initialMode = 'login', initialCode = '' }) {
  const { theme } = useTheme()
  const [mode, setMode] = useState(initialMode)
  const [redeemCode, setRedeemCode] = useState(initialCode)
  const [redeemHint, setRedeemHint] = useState(null)
  const [redeemResult, setRedeemResult] = useState(null)
  const [partnerRedeem, setPartnerRedeem] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoError, setDemoError] = useState(null)

  function switchMode(next) {
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
        <div className="login-card">
          <div className="login-card-head">
            <span className="eyebrow">{copy.eyebrow}</span>
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
                {demoLoading ? 'Lädt …' : 'Erst mal unverbindlich reinschauen: Demo ansehen'}
              </button>
              <p className="field-hint">Ohne Anmeldung, schreibgeschützt – mit Beispiel-Tieren über mehrere Generationen.</p>
            </div>
          )}
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
