import { useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { api, setUnauthorizedHandler } from './api'
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

const NAV_ITEMS = [
  { to: '/stammbaum', icon: 'tree', label: 'Stammbaum' },
  { to: '/pinnwand', icon: 'pin', label: 'Pinnwand' },
  { to: '/zuchtbuch', icon: 'book', label: 'Zuchtbuch' },
  { to: '/collage', icon: 'collage', label: 'Collage' }
]

function AppHeader({ family, onLogout }) {
  const { pathname } = useLocation()
  // Hundeseiten gehören zum Stammbaum
  const isActive = (item, active) => active || (item.to === '/stammbaum' && pathname.startsWith('/hund/'))
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
        <button type="button" className="icon-btn app-logout" onClick={onLogout} aria-label="Abmelden" title="Abmelden">
          <Icon name="logout" />
        </button>
      </div>
    </header>
  )
}

export default function App() {
  const [family, setFamily] = useState(undefined)
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

  // Admin-Bereich hat einen eigenen Login, unabhängig vom Rudel-Login
  if (pathname.startsWith('/admin')) return <AdminPage />

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
    <div className="app-shell">
      <ScrollToTop />
      <AppHeader family={family} onLogout={handleLogout} />
      <main className="app-main">
        <Routes>
          <Route path="/stammbaum" element={<OverviewPage family={family} onFamilyChange={setFamily} />} />
          <Route path="/hund/:id" element={<DogDetailPage family={family} />} />
          <Route path="/pinnwand" element={<PinboardPage />} />
          <Route path="/zuchtbuch" element={<BreedingPage />} />
          <Route path="/collage" element={<CollagePage />} />
          <Route path="*" element={<Navigate to="/stammbaum" replace />} />
        </Routes>
      </main>
      <footer className="app-footer">
        <div className="tricolor" aria-hidden="true" />
        <p>Familienchronik · damit wir wissen, wie es den anderen geht</p>
      </footer>
    </div>
  )
}
