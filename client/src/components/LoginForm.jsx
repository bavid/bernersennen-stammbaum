import { useState } from 'react'
import { api } from '../api'
import PasswordField from './PasswordField.jsx'
import { useT } from '../lib/i18n/index.js'

// Anmelden per Schlüssel (Standardfall) oder – aufklappbar – per Benutzername/Passwort. Ein offener
// Gutschein im Schlüsselfeld beantwortet der Server mit 409 { redeem: true }: onRedeemRequired wechselt
// dann in den Einlöse-Modus, statt nur einen Fehler zu zeigen.
export default function LoginForm({ onLogin, onRedeemRequired, onForgot }) {
  const t = useT()
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
              {t('login.form.username')}
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
            label={t('login.form.password')}
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />
        </>
      ) : (
        <PasswordField
          id="login-secret"
          label={t('login.form.secret')}
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
        {loading ? t('login.form.opening') : t('login.form.open')}
      </button>
      <div className="login-links">
        <button type="button" className="login-link-btn" onClick={toggleUsername}>
          {useUsername ? t('login.form.withKey') : t('login.form.withUser')}
        </button>
        <button type="button" className="login-link-btn" onClick={onForgot}>
          {t('login.form.forgot')}
        </button>
      </div>
    </form>
  )
}
