import { useEffect, useState } from 'react'
import { api } from '../api'
import BernerMark from '../components/BernerMark.jsx'
import Icon from '../components/Icon.jsx'

const MIN_PASSWORD_LENGTH = 6

function PasswordField({ id, label, value, onChange, autoFocus, autoComplete, minLength }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="field">
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
    </div>
  )
}

function LoginForm({ onLogin }) {
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
        label="Rudel-Passwort"
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

function CreateFamilyForm({ onLogin, inviteRequired }) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      onLogin(await api.createFamily({ name, password, inviteCode: inviteCode || undefined }))
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="field">
        <label className="field-label" htmlFor="family-name">
          Name des Rudels
        </label>
        <input
          id="family-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="z. B. Rudel vom Sonnenhang"
          maxLength={80}
          autoFocus
          required
        />
      </div>
      <PasswordField
        id="family-password"
        label="Gemeinsames Passwort"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
      />
      <p className="field-hint">
        Mindestens {MIN_PASSWORD_LENGTH} Zeichen. Alle, die das Passwort kennen, können die Chronik mitpflegen.
      </p>
      {inviteRequired && (
        <div className="field">
          <label className="field-label" htmlFor="invite-code">
            Einladungscode
          </label>
          <input id="invite-code" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} required />
        </div>
      )}
      <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={loading}>
        {loading ? 'Lege an …' : 'Rudel anlegen'}
      </button>
    </form>
  )
}

export default function LoginPage({ onLogin }) {
  const [mode, setMode] = useState(() => (window.location.pathname === '/neue-familie' ? 'create' : 'login'))
  const [inviteRequired, setInviteRequired] = useState(false)

  useEffect(() => {
    api
      .config()
      .then((config) => setInviteRequired(config.inviteRequired))
      .catch(() => setInviteRequired(false))
  }, [])

  return (
    <div className="login">
      <section className="login-hero" aria-hidden="true">
        <div className="login-hero-inner">
          <BernerMark size={88} className="login-mark" />
          <p className="login-kicker">Eine Familie · viele Zuhause</p>
          <p className="login-headline">
            Wie geht’s
            <br />
            <em>den anderen?</em>
          </p>
          <p className="login-lede">
            Geschwister, Eltern und Großeltern leben in verschiedenen Familien. Hier bleibt ihr verbunden: Klickt einen
            Hund an und schaut nach, was er so treibt.
          </p>
          <ul className="login-facts">
            <li>
              <strong>Stammbaum</strong>
              <span>wer mit wem verwandt ist</span>
            </li>
            <li>
              <strong>Chronik</strong>
              <span>was jeder Hund erlebt</span>
            </li>
            <li>
              <strong>Pinnwand</strong>
              <span>Treffen und Notizen für alle</span>
            </li>
          </ul>
        </div>
        <div className="tricolor tricolor-vertical" />
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div className="login-card-head">
            <span className="eyebrow">{mode === 'login' ? 'Willkommen zurück' : 'Neuer Stammbaum'}</span>
            <h1>{mode === 'login' ? 'Anmelden' : 'Rudel anlegen'}</h1>
            <p className="muted">
              {mode === 'login'
                ? 'Mit dem gemeinsamen Passwort seht ihr, was sich bei allen tut.'
                : 'Gebt eurem Rudel einen Namen und ein gemeinsames Passwort.'}
            </p>
          </div>

          <div className="segmented login-switch" role="group" aria-label="Modus">
            <button type="button" aria-pressed={mode === 'login'} onClick={() => setMode('login')}>
              Anmelden
            </button>
            <button type="button" aria-pressed={mode === 'create'} onClick={() => setMode('create')}>
              Neues Rudel
            </button>
          </div>

          {mode === 'login' ? (
            <LoginForm onLogin={onLogin} />
          ) : (
            <CreateFamilyForm onLogin={onLogin} inviteRequired={inviteRequired} />
          )}
        </div>
      </section>
    </div>
  )
}
