import { useState } from 'react'
import { api } from '../api'
import Icon from './Icon.jsx'
import PasswordField from './PasswordField.jsx'
import Honeypot from './Honeypot.jsx'
import { formatVoucherCode, isCompleteVoucherCode } from '../lib/voucherCode.js'

const ACCOUNT_PASSWORD_MIN = 8
const NAME_MAX_LENGTH = 80
const EMAIL_MAX_LENGTH = 120

const STATUS_TEXT = {
  offen: 'Gutschein gültig',
  eingelöst: 'Dieser Gutschein wurde schon eingelöst.',
  abgelaufen: 'Dieser Gutschein ist abgelaufen.',
  widerrufen: 'Dieser Gutschein wurde zurückgezogen.',
  unbekannt: 'Diesen Gutschein kennen wir nicht.'
}

// Ein Gutschein wird zu "Meiner Chronik": Code, Name fürs Zuhause, optional ein eigener Benutzer.
// onRedeemed bekommt die volle Server-Antwort (inkl. key/fromOthers) – die aufrufende Seite entscheidet,
// was damit passiert (erst den Schlüssel zeigen, siehe KeyReveal).
export default function RedeemForm({ initialCode = '', hint = null, onRedeemed }) {
  const [code, setCode] = useState(() => formatVoucherCode(initialCode))
  const [name, setName] = useState('')
  const [showAccount, setShowAccount] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [status, setStatus] = useState(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  function handleCodeChange(value) {
    setCode(formatVoucherCode(value))
    setStatus(null)
  }

  async function handleCodeBlur() {
    if (!isCompleteVoucherCode(code)) return
    setChecking(true)
    try {
      const result = await api.checkVoucher(code)
      setStatus(result.status)
    } catch {
      setStatus(null)
    } finally {
      setChecking(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const me = await api.redeemVoucher({
        code,
        name,
        username: showAccount ? username || undefined : undefined,
        password: showAccount ? password || undefined : undefined,
        email: showAccount ? email || undefined : undefined,
        website
      })
      onRedeemed(me)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const knownInvalid = Boolean(status) && status !== 'offen'
  const statusText = status ? STATUS_TEXT[status] || STATUS_TEXT.unbekannt : null

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      {hint && <p className="field-hint redeem-hint">{hint}</p>}
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <div className={`field ${knownInvalid ? 'has-error' : ''}`}>
        <label className="field-label" htmlFor="redeem-code">
          Gutscheincode
        </label>
        <input
          id="redeem-code"
          className="voucher-code-input"
          value={code}
          onChange={(e) => handleCodeChange(e.target.value)}
          onBlur={handleCodeBlur}
          placeholder="XXXX-XXXX-XXXX"
          autoComplete="off"
          autoFocus
          required
        />
        {checking && <p className="field-hint">Prüfe …</p>}
        {!checking && statusText && (
          <p className={status === 'offen' ? 'field-hint field-hint-success' : 'field-error'} role={status === 'offen' ? 'status' : 'alert'}>
            {status !== 'offen' && <Icon name="alert" />} {statusText}
          </p>
        )}
      </div>
      <div className="field">
        <label className="field-label" htmlFor="redeem-name">
          Wie heißt euer Zuhause?
        </label>
        <input
          id="redeem-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="z. B. Zuhause am Deich"
          maxLength={NAME_MAX_LENGTH}
          required
        />
      </div>
      <button type="button" className="expand-toggle" aria-expanded={showAccount} onClick={() => setShowAccount(!showAccount)}>
        Benutzername und eigenes Passwort (optional)
        <Icon name="chevronDown" className={showAccount ? 'is-flipped' : ''} />
      </button>
      {showAccount && (
        <div className="redeem-account form-stack">
          <div className="field">
            <label className="field-label" htmlFor="redeem-username">
              Benutzername
            </label>
            <input id="redeem-username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </div>
          <PasswordField
            id="redeem-password"
            label="Passwort"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            minLength={ACCOUNT_PASSWORD_MIN}
            required={false}
          />
          <div className="field">
            <label className="field-label" htmlFor="redeem-email">
              E-Mail <span className="muted">(optional)</span>
            </label>
            <input id="redeem-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={EMAIL_MAX_LENGTH} />
            <span className="field-hint">Nur für Rückfragen, keine Werbung.</span>
          </div>
        </div>
      )}
      <Honeypot value={website} onChange={setWebsite} />
      <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={loading || knownInvalid}>
        {loading ? 'Lege an …' : 'Meine Chronik anlegen'}
      </button>
    </form>
  )
}
