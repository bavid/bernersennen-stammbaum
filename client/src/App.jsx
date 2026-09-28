import { useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { api, setUnauthorizedHandler } from './api'
import { DemoProvider } from './lib/demo.js'
import { readSetting, writeSetting } from './lib/storage.js'
import { startRoute } from './lib/areas.js'
import { ThemeProvider, useTheme } from './themes/ThemeProvider.jsx'
import ThemeMark from './components/ThemeMark.jsx'
import Icon from './components/Icon.jsx'
import ScrollToTop from './components/ScrollToTop.jsx'
import ContextSwitcher from './components/ContextSwitcher.jsx'
import LoginPage from './pages/LoginPage.jsx'
import OverviewPage from './pages/OverviewPage.jsx'
import DogDetailPage from './pages/DogDetailPage.jsx'
import CompanionsPage from './pages/CompanionsPage.jsx'
import LittersPage from './pages/LittersPage.jsx'
import CollagePage from './pages/CollagePage.jsx'
import PinboardPage from './pages/PinboardPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import ContactAdminPage from './pages/ContactAdminPage.jsx'
import Modal from './components/Modal.jsx'
import InviteDialog from './components/InviteDialog.jsx'

// Haushalte ("Meine Chronik") sehen den Wegbegleiter statt der Würfe – Rudel weiterhin wie bisher.
const NAV_ITEMS_HOME = [
  { to: '/wegbegleiter', icon: 'route', label: 'Wegbegleiter' },
  { to: '/stammbaum', icon: 'tree', label: 'Stammbaum' },
  { to: '/pinnwand', icon: 'pin', label: 'Pinnwand' },
  { to: '/collage', icon: 'collage', label: 'Collage' }
]

const NAV_ITEMS_GROUP = [
  { to: '/stammbaum', icon: 'tree', label: 'Stammbaum' },
  { to: '/pinnwand', icon: 'pin', label: 'Pinnwand' },
  { to: '/wuerfe', icon: 'sprout', label: 'Würfe' },
  { to: '/collage', icon: 'collage', label: 'Collage' }
]

function navItemsFor(family) {
  return family.art === 'zuhause' ? NAV_ITEMS_HOME : NAV_ITEMS_GROUP
}

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

export function AppHeader({ family, onLogout, onFamilyChange }) {
  const { pathname } = useLocation()
  const { theme } = useTheme()
  // Tierseiten gehören zum Stammbaum
  const isActive = (item, active) => active || (item.to === '/stammbaum' && pathname.startsWith('/tier/'))
  // Nur Haushalte bekommen den Bereichswechsler; klassische Rudel-Logins (kein family.home) zeigen nur den Namen.
  const isHouseholdIdentity = family.home?.art === 'zuhause'
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="brand">
          {/* Eigenes, aus der Tab-Reihenfolge ausgeblendetes Icon-Link: der Name daneben ist das
              eigentliche, für Tastatur und Screenreader erreichbare Ziel zum Stammbaum/Wegbegleiter. */}
          <Link to={startRoute(family)} className="brand-mark" tabIndex={-1} aria-hidden="true">
            <ThemeMark size={40} />
          </Link>
          <span className="brand-text">
            <Link to={startRoute(family)} className="brand-name">
              {theme.appName}
            </Link>
            {isHouseholdIdentity ? (
              <ContextSwitcher family={family} onChange={onFamilyChange} />
            ) : (
              <span className="brand-sub">{family.name}</span>
            )}
          </span>
        </div>
        <nav className="app-nav" aria-label="Hauptnavigation">
          {navItemsFor(family).map((item) => (
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
  const { pathname, hash } = useLocation()
  const navigate = useNavigate()
  // Code aus /v#CODE einmalig einsammeln und die Adresse sofort bereinigen – noch vor jedem
  // Netzwerk-Aufruf (siehe die erste useEffect unten). Bleibt "im Speicher", auch wenn man sich auf
  // /v erst noch abmelden muss (siehe unten, Karte "angemeldet als …"), und wird beim Anmelden über
  // handleVoucherLogin geleert – niemand sonst liest hash danach noch.
  const [voucherCode, setVoucherCode] = useState(() => {
    if (pathname !== '/v' || !hash) return ''
    // history.state bleibt erhalten (nicht null) – sonst verliert React Routers eigene History
    // ihren Zustand (usr/key/idx); pathname+search kommen bewusst von window.location, nicht vom
    // useLocation()-Wert oben, der Realität der Adressleiste entsprechend.
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
    return hash.slice(1)
  })

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

  // Anmeldung auf /v (eingelöst, per Schlüssel/Passwort oder Demo): family setzen reicht allein nicht,
  // der Pfad bleibt sonst /v und zeigt dauerhaft die Karte "Du bist angemeldet als …" (siehe family-Zweig
  // unten). Der Gutscheincode wird hier gleich mit geleert, er wird nach dem Anmelden nicht mehr gebraucht.
  function handleVoucherLogin(me) {
    setFamily(me)
    setVoucherCode('')
    navigate(startRoute(me), { replace: true })
  }

  // Voller Seitenwechsel: die Route /v zeigt die Login-Seite direkt im Einlöse-Modus – ein einfacher
  // Reload ist hier robuster als Logout- und Navigations-State zu verschränken.
  async function handleLeaveDemo() {
    await api.logout()
    window.location.href = '/v'
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

  // Öffentlicher Gutschein-Link (Karte, QR): /v#CODE. Mit bestehender Sitzung erst abmelden lassen –
  // der Code bleibt dabei in voucherCode "im Speicher" und geht in die Login-Seite, sobald family null ist.
  if (pathname === '/v') {
    return (
      <ThemeProvider themeId="standard">
        {family ? (
          <div className="login voucher-session">
            <section className="login-panel">
              <div className="card voucher-session-card">
                <p>
                  Du bist angemeldet als <strong>{family.name}</strong>.
                </p>
                <button type="button" className="btn btn-primary btn-block" onClick={handleLogout}>
                  Abmelden und Gutschein einlösen
                </button>
              </div>
            </section>
          </div>
        ) : (
          <LoginPage onLogin={handleVoucherLogin} initialMode="redeem" initialCode={voucherCode} />
        )}
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
          <AppHeader family={family} onLogout={handleLogout} onFamilyChange={setFamily} />
          {/* key={family.id}: Seiten laden ihre Daten einmalig in useEffect(…, []) – ohne den key
              bliebe beim Wechsel des Bereichs (ContextSwitcher navigiert zur Start-Route, die dem
              aktuellen Pfad entsprechen kann, z. B. Stammbaum -> Stammbaum) die alte Seiteninstanz
              samt Daten des vorherigen Bereichs stehen. Der key erzwingt ein sauberes Neu-Mounten. */}
          <main className="app-main" key={family.id}>
            <Routes>
              <Route
                path="/stammbaum"
                element={<OverviewPage family={family} onFamilyChange={setFamily} onInvite={() => setInviteOpen(true)} />}
              />
              <Route path="/tier/:id" element={<DogDetailPage family={family} onFamilyChange={setFamily} />} />
              <Route path="/hund/:id" element={<RedirectTierUrl />} />
              <Route
                path="/wegbegleiter"
                element={family.art === 'zuhause' ? <CompanionsPage family={family} /> : <Navigate to={startRoute(family)} replace />}
              />
              <Route path="/pinnwand" element={<PinboardPage />} />
              <Route path="/wuerfe" element={<LittersPage />} />
              <Route path="/zuchtbuch" element={<Navigate to="/wuerfe" replace />} />
              <Route path="/admin-schreiben" element={<ContactAdminPage />} />
              <Route path="/collage" element={<CollagePage family={family} />} />
              <Route path="*" element={<Navigate to={startRoute(family)} replace />} />
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
