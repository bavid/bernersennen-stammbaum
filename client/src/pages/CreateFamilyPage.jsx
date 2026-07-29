import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function CreateFamilyPage({ onCreated }) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const family = await api.createFamily(name, password)
      onCreated(family)
      navigate('/stammbaum')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="eyebrow">Neuer Stammbaum</div>
        <h1>Rudel anlegen</h1>
        <p>Vergib einen Namen und ein Passwort. Jeder, der das Passwort kennt, kann später mitpflegen.</p>
      </div>

      <form className="form-stack card" onSubmit={handleSubmit}>
        {error && <div className="error-banner">{error}</div>}
        <div className="form-row">
          <label htmlFor="name">Familien-/Rudelname</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </div>
        <div className="form-row">
          <label htmlFor="password">Passwort</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={4}
            required
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Lege an...' : 'Stammbaum erstellen'}
        </button>
        <p>
          Schon eine Familie? <Link to="/">Zurück zum Login</Link>
        </p>
      </form>
    </div>
  )
}
