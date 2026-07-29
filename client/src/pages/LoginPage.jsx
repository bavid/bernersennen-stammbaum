import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { api } from '../api'

export default function LoginPage({ family, onLogin }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const location = useLocation()

  if (family) {
    const redirectTo = location.state?.from?.pathname || '/stammbaum'
    return <Navigate to={redirectTo} replace />
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const loggedInFamily = await api.login(password)
      onLogin(loggedInFamily)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="eyebrow">Willkommen zurück</div>
        <h1>Familienchronik</h1>
        <p>Gib das Passwort eures Rudels ein, um euren Stammbaum zu öffnen.</p>
      </div>

      <form className="form-stack card" onSubmit={handleSubmit}>
        {error && <div className="error-banner">{error}</div>}
        <div className="form-row">
          <label htmlFor="password">Passwort</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Prüfe...' : 'Einloggen'}
        </button>
        <p>
          Noch keine Familie angelegt? <Link to="/neue-familie">Neuen Stammbaum erstellen</Link>
        </p>
      </form>
    </div>
  )
}
