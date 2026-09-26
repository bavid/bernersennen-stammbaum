import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import BernerMark from '../components/BernerMark.jsx'
import Icon from '../components/Icon.jsx'
import AdminFamilyDetails from '../components/AdminFamilyDetails.jsx'
import AdminMessages from '../components/AdminMessages.jsx'
import { relativeTime } from '../lib/dates.js'

const BYTES_PER_MB = 1024 * 1024

function AdminLogin({ onLogin }) {
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
        <BernerMark size={56} />
        <div>
          <span className="eyebrow">Familienchronik</span>
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
        <button className="btn btn-ink btn-lg" type="submit" disabled={loading}>
          {loading ? 'Prüfe …' : 'Anmelden'}
        </button>
        <Link to="/" className="back-link">
          <Icon name="arrowLeft" /> Zur Familienchronik
        </Link>
      </form>
    </div>
  )
}

function StatsGrid({ stats }) {
  const items = [
    ['Offene Nachrichten', stats.openMessages],
    ['Rudel', stats.families],
    ['Hunde', stats.dogs],
    ['Einträge', stats.entries],
    ['Zettel', stats.notes],
    ['Antworten', stats.replies],
    ['Würfe', stats.breeding],
    ['Fotos', stats.uploads.files, `${(stats.uploads.bytes / BYTES_PER_MB).toFixed(1).replace('.', ',')} MB`]
  ]
  return (
    <dl className="admin-stats">
      {items.map(([label, value, hint]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>
            {value}
            {hint && <small>{hint}</small>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Dashboard({ onLogout }) {
  const [overview, setOverview] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.admin
      .overview()
      .then(setOverview)
      .catch((err) => setError(err.message))
  }, [])

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <span className="admin-brand">
          <BernerMark size={34} /> Familienchronik · <strong>Admin</strong>
        </span>
        <span className="admin-header-actions">
          <Link to="/" className="btn btn-ghost">
            Zur App
          </Link>
          <button type="button" className="btn btn-ink" onClick={onLogout}>
            <Icon name="logout" /> Abmelden
          </button>
        </span>
      </header>

      <main className="admin-main">
        {error && <div className="error-banner" role="alert">{error}</div>}
        {!overview && !error && <p className="muted">Lade …</p>}
        {overview && (
          <>
            <StatsGrid stats={overview.stats} />

            <AdminMessages
              onCountChange={(delta) =>
                setOverview((current) => ({
                  ...current,
                  stats: { ...current.stats, openMessages: Math.max(0, current.stats.openMessages + delta) }
                }))
              }
            />

            <div className="admin-invite card">
              <span className="field-label">Einladungscode für neue Rudel</span>
              <code>{overview.inviteCode || '– keiner gesetzt (jeder darf Rudel anlegen) –'}</code>
            </div>

            <section className="admin-families" aria-labelledby="admin-families-title">
              <h2 id="admin-families-title">Alle Rudel</h2>
              {overview.families.map((family) => {
                const open = openId === family.id
                return (
                  <article key={family.id} className={`admin-family card ${open ? 'is-open' : ''}`}>
                    <button
                      type="button"
                      className="admin-family-head"
                      aria-expanded={open}
                      onClick={() => setOpenId(open ? null : family.id)}
                    >
                      <span>
                        <strong className="admin-family-name">{family.name}</strong>
                        <span className="muted">
                          angelegt {relativeTime(family.created_at)}
                          {family.last_activity ? ` · zuletzt aktiv ${relativeTime(family.last_activity)}` : ''}
                        </span>
                      </span>
                      <span className="admin-family-counts">
                        <span className="pill">{family.dogs} Hunde</span>
                        <span className="pill">{family.entries} Einträge</span>
                        <span className="pill">{family.notes} Zettel</span>
                        <span className="pill">{family.replies} Antworten</span>
                      </span>
                    </button>
                    {open && <AdminFamilyDetails familyId={family.id} />}
                  </article>
                )
              })}
            </section>
          </>
        )}
      </main>
    </div>
  )
}

export default function AdminPage() {
  const [admin, setAdmin] = useState(undefined)

  useEffect(() => {
    api.admin
      .me()
      .then(setAdmin)
      .catch(() => setAdmin(null))
  }, [])

  async function handleLogout() {
    try {
      await api.admin.logout()
    } finally {
      setAdmin(null)
    }
  }

  if (admin === undefined) return <div className="splash" aria-busy="true" />
  if (!admin) return <AdminLogin onLogin={setAdmin} />
  return <Dashboard onLogout={handleLogout} />
}
