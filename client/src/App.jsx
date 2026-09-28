import { useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { api, setUnauthorizedHandler } from './api'
import { DemoProvider } from './lib/demo.js'
import { readSetting, writeSetting } from './lib/storage.js'
import { ThemeProvider, useTheme } from './themes/ThemeProvider.jsx'
import ThemeMark from './components/ThemeMark.jsx'
import Icon from './components/Icon.jsx'
import ScrollToTop from './components/ScrollToTop.jsx'
import LoginPage from './pages/LoginPage.jsx'
import OverviewPage from './pages/OverviewPage.jsx'
import DogDetailPage from './pages/DogDetailPage.jsx'
import LittersPage from './pages/LittersPage.jsx'
import CollagePage from './pages/CollagePage.jsx'
import PinboardPage from './pages/PinboardPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import ContactAdminPage from './pages/ContactAdminPage.jsx'
import Modal from './components/Modal.jsx'
import InviteDialog from './components/InviteDialog.jsx'

const NAV_ITEMS = [
  { to: '/stammbaum', icon: 'tree', label: 'Stammbaum' },
  { to: '/pinnwand', icon: 'pin', label: 'Pinnwand' },
  { to: '/wuerfe', icon: 'sprout', label: 'Würfe' },
  { to: '/collage', icon: 'collage', label: 'Collage' }
]

export function DemoBanner({ onLeave }) {
  const { words } = useTheme()
  return (
    <div className="demo-banner" role="status">
      <Icon name="alert" />
      <span>Du siehst eine schreibgeschützte Demo – nichts wird gespeichert oder hochgeladen.</span>
      <button type="button" className="btn btn-primary" onClick={onLeave}>
        {words.createOwnGroup}
      </button>
    </div>
  )
}

// Alte /hund/:id-Links (vor der Umbenennung zu /tier/:id geteilt) funktionieren weiter
function RedirectTierUrl() {
  const { id } = useParams()
  const { hash } = useLocation()
  return <Navigate to={`/tier/${id}${hash}`} replace />
}

export function AppHeader({ family, onLogout }) {
  const { pathname } = useLocation()
  const { theme } = useTheme()
  // Tierseiten gehören zum Stammbaum
  const isActive = (item, active) => active || (item.to === '/stammbaum' && pathname.startsWith('/tier/'))
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link to="/stammbaum" className="brand">
          <ThemeMark size={40} />
          <span className="brand-text">
            <span className="brand-name">{theme.appName}</span>
            <span className="brand-sub">{family.name}</span>
          </span>
        </Link>
        <nav className="app-nav" aria-label="Hauptnavigation">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive: active }) => (isActive(item, active) ? 'active' : '')}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <Link
          to="/admin-schreiben"
          state={{ from: pathname }}
          className={`app-contact ${pathname === '/admin-schreiben' ? 'active' : ''}`}
          title="Schreib dem Admin"
        >
          <Icon name="message" />
          <span>Schreib dem Admin</span>
        </Link>
        <button type="button" className="icon-btn app-logout" onClick={onLogout} aria-label="Abmelden" title="Abmelden">
          <Icon name="logout" />
        </button>
      </div>
    </header>
  )
}

export function AppFooter({ onInvite }) {
  const { theme } = useTheme()
  return (
    <footer className="app-footer">
      {theme.tricolor && <div className="tricolor" aria-hidden="true" />}
      <p>{theme.footer}</p>
      <button type="button" className="footer-link" onClick={onInvite}>
        Jemanden einladen
      </button>
    </footer>
  )
}

export default function App() {
  const [family, setFamily] = useState(undefined)
  const [inviteOpen, setInviteOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    setUnauthorizedHandler(() => setFamily(null))
    api
      .me()
      .then(setFamily)
      .catch(() => setFamily(null))
  }, [])

  // Merkt sich das Aussehen der zuletzt angemeldeten Familie, damit der Splash-Screen beim nächsten
  // Laden (bevor /api/me geantwortet hat) nicht kurz den falschen Auftritt zeigt.
  useEffect(() => {
    if (family?.theme) writeSetting('lastThemeId', family.theme)
  }, [family])

  async function handleLogout() {
    try {
      await api.logout()
    } finally {
      setFamily(null)
    }
  }

  // Voller Seitenwechsel: LoginPage entscheidet ihren Anlege/Anmelden-Modus einmalig beim Mount
  // anhand der URL – ein einfacher Reload ist hier robuster als Logout- und Navigations-State zu verschränken.
  async function handleLeaveDemo() {
    await api.logout()
    window.location.href = '/neue-familie'
  }

  // Admin-Bereich hat einen eigenen Login, unabhängig vom Rudel-Login, immer im Standard-Auftritt
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return (
      <ThemeProvider themeId="standard">
        <AdminPage />
      </ThemeProvider>
    )
  }

  if (family === undefined) {
    return (
      <ThemeProvider themeId={readSetting('lastThemeId', 'standard')}>
        <div className="splash" aria-busy="true">
          <ThemeMark size={72} />
        </div>
      </ThemeProvider>
    )
  }

  if (!family) {
    return (
      <ThemeProvider themeId="standard">
        <LoginPage onLogin={setFamily} />
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider themeId={family.theme}>
      <DemoProvider value={Boolean(family.isDemo)}>
        <div className="app-shell">
          <ScrollToTop />
          {family.isDemo && <DemoBanner onLeave={handleLeaveDemo} />}
          <AppHeader family={family} onLogout={handleLogout} />
          <main className="app-main">
            <Routes>
              <Route
                path="/stammbaum"
                element={<OverviewPage family={family} onFamilyChange={setFamily} onInvite={() => setInviteOpen(true)} />}
              />
              <Route path="/tier/:id" element={<DogDetailPage family={family} />} />
              <Route path="/hund/:id" element={<RedirectTierUrl />} />
              <Route path="/pinnwand" element={<PinboardPage />} />
              <Route path="/wuerfe" element={<LittersPage />} />
              <Route path="/zuchtbuch" element={<Navigate to="/wuerfe" replace />} />
              <Route path="/admin-schreiben" element={<ContactAdminPage />} />
              <Route path="/collage" element={<CollagePage family={family} />} />
              <Route path="*" element={<Navigate to="/stammbaum" replace />} />
            </Routes>
          </main>
          <AppFooter onInvite={() => setInviteOpen(true)} />
          <Modal open={inviteOpen} title="Jemanden einladen" onClose={() => setInviteOpen(false)}>
            <InviteDialog family={family} />
          </Modal>
        </div>
      </DemoProvider>
    </ThemeProvider>
  )
}
