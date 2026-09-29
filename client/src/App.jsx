import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { api, setUnauthorizedHandler } from './api'
import { DemoProvider } from './lib/demo.js'
import { readSetting, writeSetting } from './lib/storage.js'
import { inviteLabel, isPartnerArea, startRoute } from './lib/areas.js'
import { MAX_NAV_ITEMS, navItemsFor } from './lib/navItems.js'
import { formatVoucherCode } from './lib/voucherCode.js'
import { ThemeProvider, useTheme } from './themes/ThemeProvider.jsx'
import ThemeMark from './components/ThemeMark.jsx'
import Icon from './components/Icon.jsx'
import ScrollToTop from './components/ScrollToTop.jsx'
import ContextSwitcher from './components/ContextSwitcher.jsx'
import ViewModeSwitch from './components/ViewModeSwitch.jsx'
import LoginPage from './pages/LoginPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import PartnerPortalPage from './pages/PartnerPortalPage.jsx'
import PartnersPage from './pages/PartnersPage.jsx'
import SteckbriefPage from './pages/SteckbriefPage.jsx'
import LegalPage from './pages/LegalPage.jsx'
import AreaRoutes from './AreaRoutes.jsx'
import Modal from './components/Modal.jsx'
import InviteDialog from './components/InviteDialog.jsx'

// /p/<slug> – öffentliches Partner-Portal, unabhängig von Groß-/Kleinschreibung des Pfads egal (der
// Slug selbst bleibt roh, die Route validiert nur die Form).
const PARTNER_SLUG_RE = /^\/p\/([^/]+)\/?$/

// /t/<slug> – öffentlicher Steckbrief eines Tiers (Phase T Task 5), derselbe Aufbau wie PARTNER_SLUG_RE.
const ANIMAL_SLUG_RE = /^\/t\/([^/]+)\/?$/

// Hauptnavigation je Bereichsart (lib/navItems.js navItemsFor), Routen des Bereichs in AreaRoutes.jsx.
// Bei der Höchstzahl von Einträgen (MAX_NAV_ITEMS) wird die Leiste kompakter (layout.css .app-nav-dense),
// damit sie am Handy bei 375 px und am schmalen Desktop ohne Überlappung passt.

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

// Karte auf /v#CODE mit laufender Sitzung (Phase T Task 5): normalerweise nur "Abmelden und Gutschein
// einlösen" - trägt der Code aber einen offenen Übergabe-Gutschein UND die Sitzung ist das eigene
// Zuhause selbst (nicht ein beigetretenes Rudel, nicht ein klassischer Rudel-Login), bietet sie
// stattdessen "In Meine Chronik übernehmen" (api.claimVoucher, ohne Ab-/Anmelden). code kommt aus dem
// #Hash der Adresse (App.jsx voucherCode) - ohne Code (z. B. direkter Aufruf von /v) bleibt es bei der
// einfachen Karte, ganz ohne Prüf-Anfrage.
function VoucherSessionCard({ family, code, onLogout, onClaimed }) {
  const [handover, setHandover] = useState(null)
  const [shelterMayRead, setShelterMayRead] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState(null)

  // voucherCode (App.jsx) kommt roh aus dem #Hash - wie RedeemForm/LoginForm geht auch hier nur der
  // formatierte Code (XXXX-XXXX-XXXX) an die API, nie der rohe Hash-Text.
  const formattedCode = formatVoucherCode(code)
  // final-review Phase T Finding 10: eine Demo-Sitzung darf nichts übernehmen (schreibgeschützt wie
  // jede andere Demo-Aktion, api.claimVoucher würde ohnehin mit 403 ablehnen) - canClaim schließt sie
  // deshalb schon hier aus, statt erst den Fehler vom Server abzuwarten.
  const isHouseholdIdentity = family.home?.art === 'zuhause'
  const canClaim = !family.isDemo && family.art === 'zuhause' && Boolean(family.home) && family.id === family.home.id
  // Ein Haushalt, der gerade ein Rudel ansieht (ContextSwitcher), kann von hier aus nicht übernehmen -
  // canClaim ist dann false, ohne dass wir wüssten, ob der Code überhaupt einen offenen Übergabe-
  // Gutschein trägt. "Abmelden und neu einlösen" wäre hier die falsche Empfehlung (verschenkt die
  // Übernahme in die bestehende Chronik) - stattdessen der Hinweis, zuerst zurückzuwechseln.
  const viewingGroupAsHousehold = isHouseholdIdentity && family.id !== family.home.id

  useEffect(() => {
    let cancelled = false
    if (!formattedCode || !canClaim) {
      setHandover(null)
      return undefined
    }
    api
      .checkVoucher(formattedCode)
      .then((result) => {
        if (!cancelled) setHandover(result.handover || null)
      })
      .catch(() => {
        if (!cancelled) setHandover(null)
      })
    return () => {
      cancelled = true
    }
  }, [formattedCode, canClaim])

  async function handleClaim() {
    setError(null)
    setClaiming(true)
    try {
      const { dogId } = await api.claimVoucher({ code: formattedCode, shelterMayRead })
      onClaimed(dogId)
    } catch (err) {
      setError(err.message)
      setClaiming(false)
    }
  }

  if (handover) {
    return (
      <div className="card voucher-session-card">
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        <p>
          Mit diesem Gutschein zieht {handover.animalName} aus {handover.shelterName} zu euch – mit der ganzen Chronik.
        </p>
        <label className="check">
          <input type="checkbox" checked={shelterMayRead} onChange={(e) => setShelterMayRead(e.target.checked)} />
          {handover.shelterName} darf weiter mitlesen (freiwillig, jederzeit widerrufbar)
        </label>
        <button type="button" className="btn btn-primary btn-block" disabled={claiming} onClick={handleClaim}>
          {claiming ? 'Übernehme …' : 'In Meine Chronik übernehmen'}
        </button>
      </div>
    )
  }

  return (
    <div className="card voucher-session-card">
      <p>
        Du bist angemeldet als <strong>{family.name}</strong>.
      </p>
      {viewingGroupAsHousehold && (
        <p className="field-hint">Wechselt oben zu „Meine Chronik“, um das Tier zu übernehmen.</p>
      )}
      <button type="button" className="btn btn-primary btn-block" onClick={onLogout}>
        Abmelden und Gutschein einlösen
      </button>
    </div>
  )
}

export function AppHeader({ family, onLogout, onFamilyChange }) {
  const { pathname } = useLocation()
  const { theme } = useTheme()
  // Tierseiten gehören zum Stammbaum bzw. (im Tierheim) zu "Tiere"
  const isActive = (item, active) =>
    active || ((item.to === '/stammbaum' || item.to === '/tiere') && pathname.startsWith('/tier/'))
  // Nur Haushalte bekommen den Bereichswechsler; klassische Rudel-Logins (kein family.home) zeigen nur den Namen.
  const isHouseholdIdentity = family.home?.art === 'zuhause'
  const navItems = navItemsFor(family)
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
        <nav className={`app-nav${navItems.length >= MAX_NAV_ITEMS ? ' app-nav-dense' : ''}`} aria-label="Hauptnavigation">
          {navItems.map((item) => (
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

// family ist optional (z. B. im Theme-Test) - ohne gilt die Beschriftung für Haushalte/Rudel.
export function AppFooter({ family, onInvite }) {
  const { theme } = useTheme()
  return (
    <footer className="app-footer">
      {theme.tricolor && <div className="tricolor" aria-hidden="true" />}
      <p>{theme.footer}</p>
      <button type="button" className="footer-link" onClick={onInvite}>
        {inviteLabel(family)}
      </button>
      <Link to="/umgebung" className="footer-link">
        Tierheime & Hundeschulen in der Nähe →
      </Link>
      <span className="app-footer-legal">
        <Link to="/impressum" className="footer-link">
          Impressum
        </Link>
        <Link to="/datenschutz" className="footer-link">
          Datenschutz
        </Link>
      </span>
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

  // Übergabe-Gutschein per api.claimVoucher übernommen (VoucherSessionCard) - anders als beim Einlösen
  // mit neuem Zuhause bleibt die Sitzung dieselbe, nur der Code wird nicht mehr gebraucht.
  function handleClaimed(dogId) {
    setVoucherCode('')
    navigate(`/tier/${dogId}`)
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
              <VoucherSessionCard family={family} code={voucherCode} onLogout={handleLogout} onClaimed={handleClaimed} />
            </section>
          </div>
        ) : (
          <LoginPage onLogin={handleVoucherLogin} initialMode="redeem" initialCode={voucherCode} />
        )}
      </ThemeProvider>
    )
  }

  // Partner-Portal und Partnerliste: öffentlich, funktionieren angemeldet wie abgemeldet (siehe dort) –
  // deshalb wie /v ein eigener früher Zweig, statt sie unter die Routen des angemeldeten Bereichs zu
  // hängen. onRedeemed teilt sich mit /v denselben Übergang: Familie setzen und zur Start-Route wechseln.
  const partnerSlug = pathname.match(PARTNER_SLUG_RE)?.[1]

  if (partnerSlug) {
    return (
      <ThemeProvider themeId="standard">
        <PartnerPortalPage slug={partnerSlug} family={family} onRedeemed={handleVoucherLogin} onLogout={handleLogout} />
      </ThemeProvider>
    )
  }

  // Öffentlicher Steckbrief /t/:slug (Phase T Task 5): wie partnerSlug oben ein eigener früher Zweig,
  // unabhängig vom Login-Status - reine Lesevorschau, keine Personalisierung nötig.
  const animalSlug = pathname.match(ANIMAL_SLUG_RE)?.[1]

  if (animalSlug) {
    return (
      <ThemeProvider themeId="standard">
        <SteckbriefPage slug={animalSlug} />
      </ThemeProvider>
    )
  }

  if (pathname === '/partner') {
    return (
      <ThemeProvider themeId="standard">
        <PartnersPage />
      </ThemeProvider>
    )
  }

  // Impressum/Datenschutz (Task 7): öffentlich, unabhängig vom Login-Status - wie /partner ein eigener
  // früher Zweig statt einer Route im angemeldeten Bereich, damit sie auch ohne Sitzung erreichbar sind.
  if (pathname === '/impressum' || pathname === '/datenschutz') {
    return (
      <ThemeProvider themeId="standard">
        <LegalPage variant={pathname === '/impressum' ? 'impressum' : 'datenschutz'} />
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
          {/* Partner- und Tierheim-Bereiche: "Bearbeiten | Kundensicht" über jeder Seite (Phase P1). */}
          {isPartnerArea(family) && <ViewModeSwitch areaId={family.id} />}
          {/* key={family.id}: Seiten laden ihre Daten einmalig in useEffect(…, []) – ohne den key
              bliebe beim Wechsel des Bereichs (ContextSwitcher navigiert zur Start-Route, die dem
              aktuellen Pfad entsprechen kann, z. B. Stammbaum -> Stammbaum) die alte Seiteninstanz
              samt Daten des vorherigen Bereichs stehen. Der key erzwingt ein sauberes Neu-Mounten. */}
          <main className="app-main" key={family.id}>
            <AreaRoutes family={family} onFamilyChange={setFamily} onInvite={() => setInviteOpen(true)} />
          </main>
          <AppFooter family={family} onInvite={() => setInviteOpen(true)} />
          <Modal open={inviteOpen} title={inviteLabel(family)} onClose={() => setInviteOpen(false)}>
            <InviteDialog family={family} />
          </Modal>
        </div>
      </DemoProvider>
    </ThemeProvider>
  )
}
