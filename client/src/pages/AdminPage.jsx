import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import ThemeMark from '../components/ThemeMark.jsx'
import Icon from '../components/Icon.jsx'
import AdminStats from '../components/AdminStats.jsx'
import AdminFamilyList from '../components/AdminFamilyList.jsx'
import AdminMessages from '../components/AdminMessages.jsx'
import AdminVouchers from '../components/AdminVouchers.jsx'
import AdminPartners from '../components/AdminPartners.jsx'
import AdminPromotions from '../components/AdminPromotions.jsx'
import AdminPostApproval from '../components/AdminPostApproval.jsx'
import AdminSupport from '../components/AdminSupport.jsx'

// Gültiges Ziel für einen Partner-Gutscheinstapel (siehe routes/admin.js POST /voucher-batches)
function partnerVoucherEligible(partner) {
  return partner.status === 'entwurf' || partner.status === 'aktiv'
}

// An einen Partner gebundener Partner-Zugang (Phase P): nur ein echter Partner (keine Demo) ohne eigenen
// Bereich (server/lib/partnerAccess.js findBindablePartner).
function partnerAccessBindable(partner) {
  return !partner.is_demo && !partner.area_family_id
}

const BYTES_PER_MB = 1024 * 1024

function AdminLogin({ onLogin }) {
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
        <button className="btn btn-ink btn-lg" type="submit" disabled={loading}>
          {loading ? 'Prüfe …' : 'Anmelden'}
        </button>
        <Link to="/" className="back-link">
          <Icon name="arrowLeft" /> Zur {theme.appName}
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
  const { theme } = useTheme()
  const [overview, setOverview] = useState(null)
  const [partners, setPartners] = useState([])
  const [error, setError] = useState(null)
  // Phase P2: "Zur Freigabe" und "Empfehlungen & Anzeigen" zeigen dieselben Zeilen - ändert eine Karte etwas,
  // zählt promotionsVersion hoch und beide laden neu. pendingCount: Zähler im Kopf.
  const [promotionsVersion, setPromotionsVersion] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const bumpPromotions = useCallback(() => setPromotionsVersion((version) => version + 1), [])

  useEffect(() => {
    api.admin
      .overview()
      .then(setOverview)
      .catch((err) => setError(err.message))
  }, [])

  // Eigener, kleiner Ladevorgang für die Partner-Auswahl in AdminVouchers ("Für Partner") und
  // AdminPromotions ("Partner (optional)") - AdminPartners lädt seine eigene (vollständigere) Liste
  // unabhängig selbst, wie AdminMessages/AdminVouchers auch.
  useEffect(() => {
    api.admin
      .partners()
      .then(setPartners)
      .catch(() => setPartners([]))
  }, [])

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <span className="admin-brand">
          <ThemeMark size={34} /> {theme.appName} · <strong>Admin</strong>
        </span>
        <span className="admin-header-actions">
          {pendingCount > 0 && (
            <a href="#admin-approval-title" className="btn btn-ghost admin-header-pending">
              <Icon name="megaphone" />
              {pendingCount} zur Freigabe
            </a>
          )}
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
            {/* Phase 5: „Übersicht“ zuerst - Einlösungen, Mundpropaganda, Klicks, Partner (ohne Demo-Daten). */}
            <AdminStats bereiche={overview.stats.families} />

            <StatsGrid stats={overview.stats} />

            <AdminMessages
              onCountChange={(delta) =>
                setOverview((current) => ({
                  ...current,
                  stats: { ...current.stats, openMessages: Math.max(0, current.stats.openMessages + delta) }
                }))
              }
            />

            <AdminPartners onChange={setPartners} />

            <AdminVouchers
              joinableFamilies={overview.families.filter((family) => family.art === 'rudel' && !family.is_demo)}
              partners={partners.filter(partnerVoucherEligible)}
              accessPartners={partners.filter(partnerAccessBindable)}
            />

            {/* Phase P2: eingereichte Beiträge der Partner zuerst - ganz oben im Marketing-Teil. */}
            <AdminPostApproval version={promotionsVersion} onChanged={bumpPromotions} onCountChange={setPendingCount} />

            {/* Reiter "Entdecken" (Phase 3 Task 5): dieselbe Partnerliste füllt die Partner-Auswahl. */}
            <AdminPromotions partners={partners} version={promotionsVersion} onChanged={bumpPromotions} />

            <AdminSupport />

            <AdminFamilyList families={overview.families} />
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
