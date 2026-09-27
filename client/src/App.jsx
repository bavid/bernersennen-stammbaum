import { useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { api, setUnauthorizedHandler } from './api'
import { DemoProvider } from './lib/demo.js'
import BernerMark from './components/BernerMark.jsx'
import Icon from './components/Icon.jsx'
import ScrollToTop from './components/ScrollToTop.jsx'
import LoginPage from './pages/LoginPage.jsx'
import OverviewPage from './pages/OverviewPage.jsx'
import DogDetailPage from './pages/DogDetailPage.jsx'
import BreedingPage from './pages/BreedingPage.jsx'
import CollagePage from './pages/CollagePage.jsx'
import PinboardPage from './pages/PinboardPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import ContactAdminPage from './pages/ContactAdminPage.jsx'
import Modal from './components/Modal.jsx'
import InviteDialog from './components/InviteDialog.jsx'

const NAV_ITEMS = [
  { to: '/stammbaum', icon: 'tree', label: 'Stammbaum' },
  { to: '/pinnwand', icon: 'pin', label: 'Pinnwand' },
  { to: '/zuchtbuch', icon: 'book', label: 'Zuchtbuch' },
  { to: '/collage', icon: 'collage', label: 'Collage' }
]

function DemoBanner({ onLeave }) {
  return (
    <div className="demo-banner" role="status">
      <Icon name="alert" />
      <span>Du siehst eine schreibgeschützte Demo – nichts wird gespeichert oder hochgeladen.</span>
      <button type="button" className="btn btn-primary" onClick={onLeave}>
        Eigenes Rudel anlegen
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

function AppHeader({ family, onLogout }) {
  const { pathname } = useLocation()
  // Tierseiten gehören zum Stammbaum
  const isActive = (item, active) => active || (item.to === '/stammbaum' && pathname.startsWith('/tier/'))
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link to="/stammbaum" className="brand">
          <BernerMark size={40} />
          <span className="brand-text">
            <span className="brand-name">Familienchronik</span>
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

  // Admin-Bereich hat einen eigenen Login, unabhängig vom Rudel-Login
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return <AdminPage />

  if (family === undefined) {
    return (
      <div className="splash" aria-busy="true">
        <BernerMark size={72} />
      </div>
    )
  }

  if (!family) {
    return <LoginPage onLogin={setFamily} />
  }

  return (
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
            <Route path="/zuchtbuch" element={<BreedingPage />} />
            <Route path="/admin-schreiben" element={<ContactAdminPage />} />
            <Route path="/collage" element={<CollagePage family={family} />} />
            <Route path="*" element={<Navigate to="/stammbaum" replace />} />
          </Routes>
        </main>
        <footer className="app-footer">
          <div className="tricolor" aria-hidden="true" />
          <p>Familienchronik · damit wir wissen, wie es den anderen geht</p>
          <button type="button" className="footer-link" onClick={() => setInviteOpen(true)}>
            Jemanden einladen
          </button>
        </footer>
        <Modal open={inviteOpen} title="Jemanden einladen" onClose={() => setInviteOpen(false)}>
          <InviteDialog family={family} />
        </Modal>
      </div>
    </DemoProvider>
  )
}
