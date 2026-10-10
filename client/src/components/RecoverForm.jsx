import { useState } from 'react'
import { api } from '../api'
import Icon from './Icon.jsx'
import PasswordField from './PasswordField.jsx'
import { formatVoucherCode } from '../lib/voucherCode.js'
import { useT } from '../lib/i18n/index.js'
import { Button } from './ui/index.js'

const NEW_PASSWORD_MIN = 8

// Der Schlüssel ist die Wiederherstellung (PUK): zusammen mit dem Benutzernamen setzt er ein neues
// Passwort. Wer keinen eigenen Benutzer hat, braucht das gar nicht – der Schlüssel selbst ist der Login.
export default function RecoverForm({ onBack }) {
  const t = useT()
  const [code, setCode] = useState('')
  const [username, setUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await api.recover({ code, username, newPassword })
      setDone(true)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="form-stack recover-done">
        <p className="field-hint field-hint-success" role="status">
          {t('login.recover.done')}
        </p>
        <Button type="button" size="lg" block onClick={onBack}>
          {t('login.recover.toSignIn')}
        </Button>
      </div>
    )
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      <button type="button" className="login-link-btn recover-back" onClick={onBack}>
        <Icon name="arrowLeft" /> {t('login.recover.back')}
      </button>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <div className="field">
        <label className="field-label" htmlFor="recover-code">
          {t('login.recover.key')}
        </label>
        <input
          id="recover-code"
          className="voucher-code-input"
          value={code}
          onChange={(e) => setCode(formatVoucherCode(e.target.value))}
          placeholder="XXXX-XXXX-XXXX"
          autoComplete="off"
          autoFocus
          required
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="recover-username">
          {t('login.form.username')}
        </label>
        <input id="recover-username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
      </div>
      <PasswordField
        id="recover-password"
        label={t('login.recover.newPassword')}
        value={newPassword}
        onChange={setNewPassword}
        autoComplete="new-password"
        minLength={NEW_PASSWORD_MIN}
      />
      <Button size="lg" block type="submit" disabled={loading || !code || !username || !newPassword}>
        {loading ? t('login.recover.changing') : t('login.recover.change')}
      </Button>
      <p className="field-hint">{t('login.recover.noUser')}</p>
    </form>
  )
}
