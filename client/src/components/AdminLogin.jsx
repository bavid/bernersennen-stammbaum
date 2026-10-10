import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import ThemeMark from './ThemeMark.jsx'
import Icon from './Icon.jsx'
import { Button } from './ui/index.js'

// Anmeldung am Admin (eigener Login, unabhängig vom Login eines Bereichs).
export default function AdminLogin({ onLogin }) {
  const { theme } = useTheme()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      onLogin(await api.admin.login(username, password))
    } catch (err) {
      setError(err.status === 404 ? 'Der Admin-Zugang ist auf diesem Server nicht eingerichtet.' : err.message)
      setLoading(false)
    }
  }

  return (
    <div className="admin-login">
      <form className="card form-stack admin-login-card" onSubmit={handleSubmit}>
        <ThemeMark size={56} />
        <div>
          <span className="eyebrow">{theme.appName}</span>
          <h1 className="admin-title">Admin</h1>
        </div>
        {error && <div className="error-banner" role="alert">{error}</div>}
        <div className="field">
          <label className="field-label" htmlFor="admin-user">
            Benutzer
          </label>
          <input id="admin-user" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required autoFocus />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="admin-password">
            Passwort
          </label>
          <input
            id="admin-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <Button variant="ink" size="lg" type="submit" disabled={loading}>
          {loading ? 'Prüfe …' : 'Anmelden'}
        </Button>
        <Link to="/" className="back-link">
          <Icon name="arrowLeft" /> Zur {theme.appName}
        </Link>
      </form>
    </div>
  )
}
