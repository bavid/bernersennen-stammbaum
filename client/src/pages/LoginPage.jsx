import { useEffect, useState } from 'react'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { HOME_LABEL } from '../lib/areas.js'
import ThemeMark from '../components/ThemeMark.jsx'
import Icon from '../components/Icon.jsx'

const MIN_PASSWORD_LENGTH = 6

// Unsichtbar für Menschen (auch für Screenreader), Bots füllen es trotzdem aus
// Nur bei der Rudel-Anlage und bewusst nach dem Passwortfeld: Passwort-Manager halten ein Textfeld
// vor dem Passwort für den Benutzernamen und füllen es sonst aus. Die data-Attribute bitten
// LastPass, 1Password, Bitwarden & Co., das Feld zu ignorieren.
function Honeypot({ value, onChange }) {
  return (
    <div className="honeypot" aria-hidden="true">
      <label htmlFor="hp-feld">Bitte leer lassen</label>
      <input
        id="hp-feld"
        name="hp_feld"
        tabIndex={-1}
        autoComplete="off"
        data-lpignore="true"
        data-1p-ignore="true"
        data-bwignore="true"
        data-form-type="other"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function PasswordField({ id, label, value, onChange, autoFocus, autoComplete, minLength, error }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="password-input">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          minLength={minLength}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          required
        />
        <button
          type="button"
          className="icon-btn"
          onClick={() => setVisible(!visible)}
          aria-label={visible ? 'Passwort verbergen' : 'Passwort anzeigen'}
        >
          <Icon name={visible ? 'eyeOff' : 'eye'} />
        </button>
      </div>
      {error && (
        <p className="field-error" id={`${id}-error`} role="alert">
          <Icon name="alert" /> {error}
        </p>
      )}
    </div>
  )
}

function LoginForm({ onLogin }) {
  const { words } = useTheme()
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      onLogin(await api.login(password))
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <PasswordField
        id="login-password"
        label={words.groupPassword}
        value={password}
        onChange={setPassword}
        autoFocus
        autoComplete="current-password"
      />
      <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={loading || !password}>
        {loading ? 'Öffne Chronik …' : 'Chronik öffnen'}
      </button>
    </form>
  )
}

function CreateFamilyForm({ onLogin, inviteRequired, art }) {
  const { words } = useTheme()
  const isHome = art === 'zuhause'
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [quelle, setQuelle] = useState('')
  const [website, setWebsite] = useState('')
  const [passwordError, setPasswordError] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setPasswordError(null)
    setLoading(true)
    try {
      onLogin(
        await api.createFamily({
          name: isHome ? HOME_LABEL : name,
          password,
          art,
          inviteCode: inviteCode || undefined,
          quelle: quelle || undefined,
          website
        })
      )
    } catch (err) {
      // "Passwort belegt" direkt am Passwortfeld zeigen, alles andere oben
      if (err.details?.field === 'password') setPasswordError(err.message)
      else setError(err.message)
      setLoading(false)
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      {error && <div className="error-banner" role="alert">{error}</div>}
      {!isHome && (
        <div className="field">
          <label className="field-label" htmlFor="family-name">
            {words.groupName}
          </label>
          <input
            id="family-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={words.groupNamePlaceholder}
            maxLength={80}
            autoFocus
            required
          />
        </div>
      )}
      <PasswordField
        id="family-password"
        label="Gemeinsames Passwort"
        value={password}
        onChange={(value) => {
          setPassword(value)
          setPasswordError(null)
        }}
        autoFocus={isHome}
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        error={passwordError}
      />
      <p className="field-hint">
        Mindestens {MIN_PASSWORD_LENGTH} Zeichen. Alle, die das Passwort kennen, können die Chronik mitpflegen.
      </p>
      <Honeypot value={website} onChange={setWebsite} />
      {inviteRequired && (
        <div className="field">
          <label className="field-label" htmlFor="invite-code">
            Einladungscode
          </label>
          <input id="invite-code" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} required />
          <span className="field-hint">
            Den Code bekommst du von der Person, die dich eingeladen hat – jedes Mitglied {words.ofAGroup} findet ihn in der
            Chronik unter „Jemanden einladen“.
          </span>
        </div>
      )}
      <div className="field">
        <label className="field-label" htmlFor="family-quelle">
          Wie hast du von uns erfahren? <span className="muted">(optional)</span>
        </label>
        <input
          id="family-quelle"
          value={quelle}
          onChange={(e) => setQuelle(e.target.value)}
          placeholder="z. B. Hundeschule, Zuchtverein, Facebook, von einem Freund"
          maxLength={200}
        />
      </div>
      <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={loading}>
        {loading ? 'Lege an …' : isHome ? 'Meine Chronik anlegen' : words.createGroup}
      </button>
    </form>
  )
}

export default function LoginPage({ onLogin }) {
  const { theme, words } = useTheme()
  const [mode, setMode] = useState(() => (window.location.pathname === '/neue-familie' ? 'create' : 'login'))
  // Im Anlege-Modus: privates Zuhause ("Meine Chronik", Standard) oder eine gemeinsame Familie/ein Rudel
  const [art, setArt] = useState('zuhause')
  const [inviteRequired, setInviteRequired] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoError, setDemoError] = useState(null)
  const isHome = art === 'zuhause'

  useEffect(() => {
    api
      .config()
      .then((config) => setInviteRequired(config.inviteRequired))
      .catch(() => setInviteRequired(false))
  }, [])

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
            <span className="eyebrow">{mode === 'login' ? 'Willkommen zurück' : 'Neuer Stammbaum'}</span>
            <h1>{mode === 'login' ? 'Anmelden' : isHome ? 'Meine Chronik anlegen' : words.createGroup}</h1>
            <p className="muted">
              {mode === 'login'
                ? 'Mit dem gemeinsamen Passwort seht ihr, was sich bei allen tut.'
                : isHome
                  ? 'Privat – für deine eigenen Tiere. Familien kannst du später beitreten.'
                  : `Gebt ${words.yourGroupDat} einen Namen und ein gemeinsames Passwort.`}
            </p>
          </div>

          <div className="segmented login-switch" role="group" aria-label="Modus">
            <button type="button" aria-pressed={mode === 'login'} onClick={() => setMode('login')}>
              Anmelden
            </button>
            <button type="button" aria-pressed={mode === 'create'} onClick={() => setMode('create')}>
              {words.newGroup}
            </button>
          </div>

          {mode === 'create' && (
            <div className="segmented login-switch" role="group" aria-label="Art">
              <button type="button" aria-pressed={art === 'zuhause'} onClick={() => setArt('zuhause')}>
                Meine Chronik
              </button>
              <button type="button" aria-pressed={art === 'rudel'} onClick={() => setArt('rudel')}>
                Gemeinsame Familie
              </button>
            </div>
          )}

          {mode === 'login' ? (
            <LoginForm onLogin={onLogin} />
          ) : (
            <CreateFamilyForm onLogin={onLogin} inviteRequired={inviteRequired} art={art} />
          )}

          <div className="login-demo">
            <span className="login-demo-divider">oder</span>
            {demoError && <div className="error-banner" role="alert">{demoError}</div>}
            <button type="button" className="btn btn-ghost btn-block" onClick={handleDemo} disabled={demoLoading}>
              {demoLoading ? 'Lädt …' : 'Erst mal unverbindlich reinschauen: Demo ansehen'}
            </button>
            <p className="field-hint">Ohne Anmeldung, schreibgeschützt – mit Beispiel-Tieren über mehrere Generationen.</p>
          </div>
        </div>
      </section>
    </div>
  )
}
