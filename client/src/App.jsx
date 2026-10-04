import { lazy, Suspense, useEffect, useLayoutEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { api, setUnauthorizedHandler } from './api'
import { setActiveArea, setAreaMismatchHandler } from './lib/activeArea.js'
import { DemoProvider, isReadOnly } from './lib/demo.js'
import { applyDarstellung, rememberDarstellung, storedDarstellung } from './lib/darstellung.js'
import { readSetting, writeSetting } from './lib/storage.js'
import { HOME_LABEL, START_ROUTE, inviteLabel, isHouseholdIdentity, isPartnerArea, startRoute } from './lib/areas.js'
import { isOwnHome } from './lib/visits.js'
import { MAX_NAV_ITEMS, hasMenuSlot, navItemsFor } from './lib/navItems.js'
import { formatVoucherCode } from './lib/voucherCode.js'
import { ThemeProvider, useTheme } from './themes/ThemeProvider.jsx'
import ThemeMark from './components/ThemeMark.jsx'
import Icon from './components/Icon.jsx'
import ScrollToTop from './components/ScrollToTop.jsx'
import AccountMenu from './components/AccountMenu.jsx'
import AccountSheet, { MenuSlotButton } from './components/AccountSheet.jsx'
import RoleBadge from './components/RoleBadge.jsx'
import DemoBanner from './components/DemoBanner.jsx'
import PartnerDemoGuide from './components/PartnerDemoGuide.jsx'
import AdminViewBanner from './components/AdminViewBanner.jsx'
import NavBadge from './components/NavBadge.jsx'
import ViewModeSwitch from './components/ViewModeSwitch.jsx'
import LoginPage from './pages/LoginPage.jsx'
import PartnerPortalPage from './pages/PartnerPortalPage.jsx'
import PartnersPage from './pages/PartnersPage.jsx'
import SteckbriefPage from './pages/SteckbriefPage.jsx'
import LegalPage from './pages/LegalPage.jsx'
import AreaRoutes from './AreaRoutes.jsx'
import Modal from './components/Modal.jsx'
import InviteDialog from './components/InviteDialog.jsx'
import RouteFallback from './components/RouteFallback.jsx'
import VisitBanner from './components/visits/VisitBanner.jsx'
import VisitClaimCard from './components/visits/VisitClaimCard.jsx'

// Der Admin-Bereich (samt aller Admin*-Komponenten) kommt erst bei Bedarf als eigener Chunk - nur der
// Admin ruft /admin je auf, alle anderen laden ihn so nicht mit.
const AdminPage = lazy(() => import('./pages/AdminPage.jsx'))
// Druckseite für Gutschein-Karten (Phase 5 Task 2): ebenfalls nur für den Admin, eigener Chunk - die QR-
// Bibliothek und die Karten lädt sonst niemand mit. Prüft die Admin-Sitzung selbst und schickt ohne zu /admin.
const AdminPrintPage = lazy(() => import('./pages/AdminPrintPage.jsx'))
// Einstieg in die Admin-Ansicht eines Bereichs (Phase 5 Task 5b): ruft POST /api/admin/view/:id und wechselt
// dann in den Bereich - ebenfalls nur für den Admin, eigener Chunk.
const AdminViewStartPage = lazy(() => import('./pages/AdminViewStartPage.jsx'))
// Druckseite eines Kunden-Gutschein-Stapels für Partner (Phase 5 Task 4): teilt sich Karten und QR-Bibliothek
// mit der Admin-Druckseite - nur Partner-Bereiche rufen sie auf, eigener Chunk.
const PartnerPrintPage = lazy(() => import('./pages/PartnerPrintPage.jsx'))
// Öffentliche Infoseite "Partner werden" (Phase 5 Task 4): selten aufgerufen, eigener Chunk.
const PartnerInfoPage = lazy(() => import('./pages/PartnerInfoPage.jsx'))
// Präsentationsmodus (Phase 5 Task 5): Vorführseite des Admins mit Kacheln, die je eine Demo in einem neuen
// Tab starten - dort landet man auf /demo-start (DemoStartPage), das POST /api/demo ruft. Beides eigene Chunks.
const AdminPresentPage = lazy(() => import('./pages/AdminPresentPage.jsx'))
const DemoStartPage = lazy(() => import('./pages/DemoStartPage.jsx'))
// Digitaler Bilderrahmen auf einem anderen Gerät (/rahmen#TOKEN): öffentlich, ohne Anmeldung - eigener Chunk.
const RahmenPage = lazy(() => import('./pages/RahmenPage.jsx'))

// /admin/gutscheine/<stapel-id>/druck - die Id ist eine Zahl (server/lib/validate.js cleanId), alles andere
// bleibt beim Admin-Dashboard.
const ADMIN_PRINT_RE = /^\/admin\/gutscheine\/(\d+)\/druck\/?$/

// /admin-ansicht/<bereichs-id> - aus der Familien- und Partnerliste des Admins in einem neuen Tab geöffnet.
const ADMIN_VIEW_RE = /^\/admin-ansicht\/(\d+)\/?$/

// /admin/praesentation - Präsentationsmodus (AdminPresentPage), aus dem Admin-Kopf.
const ADMIN_PRESENT_RE = /^\/admin\/praesentation\/?$/

// /demo-start?as=…&slug=…&ziel=… - Einstieg hinter jeder Kachel des Präsentationsmodus (lib/present.js).
const DEMO_START_PATH = '/demo-start'

// /rahmen#TOKEN - Bilderrahmen auf einem anderen Gerät (RahmenPage; dieselbe Adresse wie lib/rahmenGeraet.js RAHMEN_PATH).
const RAHMEN_PATH = '/rahmen'

// /partner-drucken/<stapel-id> - Druckseite eines Kunden-Gutschein-Stapels aus dem Partner-Profil (Reiter
// "Kunden-Gutscheine"); nur mit Sitzung in einem Partner- oder Tierheim-Bereich, sonst Login bzw. Startseite.
const PARTNER_PRINT_RE = /^\/partner-drucken\/(\d+)\/?$/

// Öffentliche Infoseite für künftige Partner (PartnerInfoPage), verlinkt von Login-Seite und Partnerliste.
const PARTNER_INFO_PATH = '/partner-werden'

// /p/<slug> – öffentliches Partner-Portal, unabhängig von Groß-/Kleinschreibung des Pfads egal (der
// Slug selbst bleibt roh, die Route validiert nur die Form).
const PARTNER_SLUG_RE = /^\/p\/([^/]+)\/?$/

// /t/<slug> – öffentlicher Steckbrief eines Tiers (Phase T Task 5), derselbe Aufbau wie PARTNER_SLUG_RE.
const ANIMAL_SLUG_RE = /^\/t\/([^/]+)\/?$/

// Karte auf /v#CODE mit laufender Sitzung (Phase T Task 5): normalerweise nur "Abmelden und Gutschein
// einlösen" - trägt der Code aber einen offenen Übergabe-Gutschein UND die Sitzung ist das eigene
// Zuhause selbst (nicht ein beigetretenes Rudel, nicht ein klassischer Rudel-Login), bietet sie
// stattdessen "In Meine Chronik übernehmen" (api.claimVoucher, ohne Ab-/Anmelden). code kommt aus dem
// #Hash der Adresse (App.jsx voucherCode) - ohne Code (z. B. direkter Aufruf von /v) bleibt es bei der
// einfachen Karte, ganz ohne Prüf-Anfrage.
// Phase V2: trägt der Code eine offene Besuchs-Einladung (checkVoucher meldet besuch), bietet die Karte im eigenen
// Zuhause stattdessen das Verbinden an (VisitClaimCard, onVisitConnected bekommt das neue "me").
function VoucherSessionCard({ family, code, onLogout, onClaimed, onVisitConnected }) {
  const [handover, setHandover] = useState(null)
  const [visit, setVisit] = useState(null)
  const [shelterMayRead, setShelterMayRead] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState(null)

  // voucherCode (App.jsx) kommt roh aus dem #Hash - wie RedeemForm/LoginForm geht auch hier nur der
  // formatierte Code (XXXX-XXXX-XXXX) an die API, nie der rohe Hash-Text.
  const formattedCode = formatVoucherCode(code)
  // final-review Phase T Finding 10: eine Demo-Sitzung darf nichts übernehmen (schreibgeschützt wie
  // jede andere Demo-Aktion, api.claimVoucher würde ohnehin mit 403 ablehnen) - canClaim schließt sie
  // deshalb schon hier aus, statt erst den Fehler vom Server abzuwarten.
  const hasHouseholdHome = family.home?.art === 'zuhause'
  const canClaim = !isReadOnly(family) && family.art === 'zuhause' && Boolean(family.home) && family.id === family.home.id
  // Ein Haushalt, der gerade ein Rudel ansieht (Gruppenseite), kann von hier aus nicht übernehmen -
  // canClaim ist dann false, ohne dass wir wüssten, ob der Code überhaupt einen offenen Übergabe-
  // Gutschein trägt. "Abmelden und neu einlösen" wäre hier die falsche Empfehlung (verschenkt die
  // Übernahme in die bestehende Chronik) - stattdessen der Hinweis, zuerst zurückzuwechseln.
  const viewingGroupAsHousehold = hasHouseholdHome && family.id !== family.home.id

  useEffect(() => {
    let cancelled = false
    if (!formattedCode || !canClaim) {
      setHandover(null)
      setVisit(null)
      return undefined
    }
    api
      .checkVoucher(formattedCode)
      .then((result) => {
        if (cancelled) return
        setHandover(result.handover || null)
        setVisit(result.besuch || null)
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

  if (visit) return <VisitClaimCard code={formattedCode} visit={visit} onConnected={onVisitConnected} />

  if (handover) {
    return (
      <div className="card voucher-session-card">
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        <p>
          Mit diesem Übergabe-Code zieht {handover.animalName} aus {handover.shelterName} zu euch – mit der ganzen Chronik.
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
        <p className="field-hint">Wechselt zuerst zu „{HOME_LABEL}“ (über „Start“), um das Tier zu übernehmen.</p>
      )}
      <button type="button" className="btn btn-primary btn-block" onClick={onLogout}>
        Abmelden und Einladungscode einlösen
      </button>
    </div>
  )
}

// Phase W: "Tiere" bleibt markiert auf den Tierseiten und beim Nachwuchs (/wuerfe, im Berner-Auftritt ein Reiter von Tiere).
function isAnimalsPath(pathname) {
  return pathname.startsWith('/tier/') || pathname === '/wuerfe'
}

// Kopf rechts für Tierheime und Partner (unverändert): "Schreib dem Admin" und Abmelden.
function PartnerHeaderActions({ onLogout }) {
  const { pathname } = useLocation()
  return (
    <>
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
    </>
  )
}

// Phase W (Ruhige Hülle): Haushalte und Familien bekommen vier feste Punkte (lib/navItems.js) und rechts das Konto-Menü
// (AccountMenu: Einstellungen, Einladen, Fotocollage, Hilfe & Kontakt, Abmelden) - am Handy als fünfter Platz "Menü" in
// der unteren Leiste. Kein Bereichswechsler mehr: das AreaGate der Routen wechselt beim Navigieren. Tierheime und
// Partner behalten ihren Kopf (bei fünf Punkten die kompakte Leiste, layout.css .app-nav-dense). onInvite: den
// Einladen-Dialog öffnen (App).
export function AppHeader({ family, onLogout, onInvite = () => {} }) {
  const { pathname } = useLocation()
  const { theme } = useTheme()
  const [sheetOpen, setSheetOpen] = useState(false)
  const isActive = (item, active) => active || (item.to === '/tiere' && isAnimalsPath(pathname))
  const navItems = navItemsFor(family, theme)
  const withMenu = hasMenuSlot(family)
  // Klassische Familien-Logins (kein Zuhause dahinter) und Partner zeigen ihren Namen unter dem Logo.
  const showName = !isHouseholdIdentity(family)
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="brand">
          {/* Eigenes, aus der Tab-Reihenfolge ausgeblendetes Icon-Link: der Name daneben ist das
              eigentliche, für Tastatur und Screenreader erreichbare Ziel zur Startseite. */}
          <Link to={startRoute(family)} className="brand-mark" tabIndex={-1} aria-hidden="true">
            <ThemeMark size={34} />
          </Link>
          <span className="brand-text">
            <Link to={startRoute(family)} className="brand-name">
              {theme.appName}
            </Link>
            {showName && (
              <span className="brand-sub">
                {family.name}
                {/* Rolle (Phase R) als Zusatz zum Namen der Familie - "Rudel vom Sonnenhang · Rudelführer" */}
                {family.art === 'rudel' && <RoleBadge rolle={family.role} />}
              </span>
            )}
          </span>
        </div>
        <nav className={`app-nav${navItems.length >= MAX_NAV_ITEMS ? ' app-nav-dense' : ''}`} aria-label="Hauptnavigation">
          {/* badge/ariaLabel: ungelesene Nachrichten an "Nachrichten" (Phase P2), offene Anfragen an "Start" (Phase W). */}
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              aria-label={item.ariaLabel}
              className={({ isActive: active }) => (isActive(item, active) ? 'active' : '')}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              <NavBadge badge={item.badge} />
            </NavLink>
          ))}
          {withMenu && <MenuSlotButton open={sheetOpen} onOpen={() => setSheetOpen(true)} />}
        </nav>
        {withMenu ? <AccountMenu family={family} onInvite={onInvite} onLogout={onLogout} /> : <PartnerHeaderActions onLogout={onLogout} />}
      </div>
      {withMenu && (
        <AccountSheet family={family} open={sheetOpen} onClose={() => setSheetOpen(false)} onInvite={onInvite} onLogout={onLogout} />
      )}
    </header>
  )
}

// family ist optional (z. B. im Theme-Test). Phase W: im Fuß nur noch der Satz des Auftritts und Impressum/Datenschutz -
// Einladen steht im Konto-Menü, "In der Nähe" bei Entdecken. Tierheime und Partner behalten ihren Fuß mit dem Weitergeben
// von Einladungscodes (inviteLabel) und dem Weg zu "Tierheime & Hundeschulen in der Nähe".
export function AppFooter({ family, onInvite }) {
  const { theme } = useTheme()
  const { pathname } = useLocation()
  const partnerArea = isPartnerArea(family)
  return (
    <footer className="app-footer">
      {theme.tricolor && <div className="tricolor" aria-hidden="true" />}
      <p>{theme.footer}</p>
      {partnerArea && (
        <button type="button" className="footer-link" onClick={onInvite}>
          {inviteLabel(family)}
        </button>
      )}
      {/* Audit V7a: auf /umgebung selbst kein Verweis auf dieselbe Seite */}
      {partnerArea && pathname !== '/umgebung' && (
        <Link to="/umgebung" className="footer-link">
          Tierheime & Hundeschulen in der Nähe →
        </Link>
      )}
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
  const { pathname, search, hash } = useLocation()
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

  // Phase W: der angezeigte Bereich geht mit jeder Anfrage mit (api.js, Header X-Bereich). Als Layout-Effekt: er läuft
  // nach dem Festschreiben (ein verworfenes Rendern setzt nichts), aber vor den Effekten der Seiten mit ihren ersten Anfragen.
  const activeId = family ? family.id : null
  useLayoutEffect(() => setActiveArea(activeId), [activeId])

  // Phase W: hat ein anderer Tab die Sitzung in einen anderen Bereich gewechselt (409 BEREICH), /me neu laden - einmal,
  // auch wenn mehrere Anfragen gleichzeitig scheitern. Das AreaGate der Seite schaltet danach zurück, main mountet neu.
  useEffect(() => {
    let reloading = false
    setAreaMismatchHandler(() => {
      if (reloading) return
      reloading = true
      api
        .me()
        .then(setFamily)
        // Nicht erreichbar oder abgemeldet: die nächste Anfrage meldet das selbst (401 -> Login, sonst Fehlerhinweis).
        .catch(() => {})
        .finally(() => {
          reloading = false
        })
    })
    return () => setAreaMismatchHandler(null)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => setFamily(null))
    // Nur den Anfangszustand setzen: die Einstiege ohne Sitzung (/demo-start, /admin-ansicht/:id) können schon vor
    // dieser Antwort eine Sitzung gesetzt haben (ihr Chunk ist geladen, die Anfrage schneller als /me) - die darf
    // ein spätes 401 von /me nicht wieder wegnehmen.
    const settleInitial = (value) => setFamily((current) => (current === undefined ? value : current))
    api
      .me()
      .then(settleInitial)
      .catch(() => settleInitial(null))
  }, [])

  // Merkt sich das Aussehen der zuletzt angemeldeten Familie, damit der Splash-Screen beim nächsten
  // Laden (bevor /api/me geantwortet hat) nicht kurz den falschen Auftritt zeigt.
  useEffect(() => {
    if (family?.theme) writeSetting('lastThemeId', family.theme)
  }, [family])

  // Darstellung (Einstellungen, lib/darstellung.js): die Wahl der Identität aus /me an <html> - und für das nächste Laden
  // gemerkt (public/darstellung-init.js), außer in Demo und Admin-Ansicht (dort gilt sie nur für diesen Besuch). Ohne
  // Sitzung (abgemeldet, Demo oder Admin-Ansicht beendet) wieder die gemerkte Wahl dieses Geräts.
  const signedOut = family === null
  const darstellung = family?.darstellung
  const rememberIt = Boolean(family) && !isReadOnly(family)
  useEffect(() => {
    if (signedOut) {
      applyDarstellung(storedDarstellung())
      return
    }
    if (!darstellung) return
    applyDarstellung(darstellung)
    if (rememberIt) rememberDarstellung(darstellung)
  }, [signedOut, darstellung, rememberIt])

  // Phase W, Schritt 2: „Einladen“ im Konto-Menü lädt aus dem eigenen Zuhause ein (Zu Besuch einladen, Zuhause
  // verschenken). Aus einer Familie oder einem Besuch heraus geht es dafür erst nach Start - dort wechselt das AreaGate
  // genau einmal nach Hause; der Dialog wartet so lange (inviteReady).
  function openInvite() {
    if (isHouseholdIdentity(family) && !isOwnHome(family)) navigate(START_ROUTE)
    setInviteOpen(true)
  }
  const inviteReady = !isHouseholdIdentity(family) || isOwnHome(family)

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

  // Besuchs-Einladung über /v#CODE aus dem eigenen Zuhause verbunden (Phase V2): Sitzung bleibt, "me" kennt den Besuch.
  function handleVisitConnected(me) {
    setFamily(me)
    setVoucherCode('')
    navigate(startRoute(me), { replace: true })
  }

  // Admin-Ansicht (Phase 5 Task 5b): AdminViewStartPage hat POST /api/admin/view/:id gerufen, me ist die
  // Antwort (Form von /me, adminView: true) - Sitzung übernehmen und in den Bereich wechseln, wie beim Login.
  function handleEnterAdminView(me) {
    setFamily(me)
    navigate(startRoute(me), { replace: true })
  }

  // Demo aus dem Präsentationsmodus (Phase 5 Task 5): DemoStartPage hat POST /api/demo gerufen, me ist die
  // Antwort - Sitzung übernehmen und zur Startroute des Demo-Bereichs oder zum Ziel (z. B. /kundensicht) wechseln.
  function handleDemoStart(me, route) {
    setFamily(me)
    setVoucherCode('')
    navigate(route || startRoute(me), { replace: true })
  }

  // "Beenden" im Band: die Nur-Lesen-Sitzung abmelden und zurück zum Admin (dessen eigenes Cookie bleibt).
  async function handleEndAdminView() {
    try {
      await api.logout()
    } finally {
      setFamily(null)
      navigate('/admin', { replace: true })
    }
  }

  // Admin-Bereich hat einen eigenen Login, unabhängig vom Rudel-Login, immer im Standard-Auftritt
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const printBatchId = pathname.match(ADMIN_PRINT_RE)?.[1]
    const isPresent = ADMIN_PRESENT_RE.test(pathname)
    return (
      <ThemeProvider themeId="standard">
        <Suspense fallback={<RouteFallback />}>
          {printBatchId ? <AdminPrintPage batchId={printBatchId} /> : isPresent ? <AdminPresentPage /> : <AdminPage />}
        </Suspense>
      </ThemeProvider>
    )
  }

  // Demo-Einstieg des Präsentationsmodus (Phase 5 Task 5): unabhängig von einer laufenden Sitzung - die Seite
  // ersetzt sie durch die Demo-Sitzung (handleDemoStart), wie /admin-ansicht/:id.
  if (pathname === DEMO_START_PATH) {
    return (
      <ThemeProvider themeId="standard">
        <Suspense fallback={<RouteFallback />}>
          <DemoStartPage search={search} onEntered={handleDemoStart} />
        </Suspense>
      </ThemeProvider>
    )
  }

  // Admin-Ansicht eines Bereichs (Phase 5 Task 5b): unabhängig von einer laufenden Sitzung - die Seite
  // ersetzt sie durch die Nur-Lesen-Sitzung des Bereichs (handleEnterAdminView).
  const adminViewId = pathname.match(ADMIN_VIEW_RE)?.[1]
  if (adminViewId) {
    return (
      <ThemeProvider themeId="standard">
        <Suspense fallback={<RouteFallback />}>
          <AdminViewStartPage familyId={adminViewId} onEntered={handleEnterAdminView} />
        </Suspense>
      </ThemeProvider>
    )
  }

  // Bilderrahmen auf einem anderen Gerät (z. B. Omas Tablet): unabhängig von jeder Sitzung, sofort ohne auf /me zu warten -
  // die Seite holt ihre Fotos allein mit dem Token des Rahmen-Links (pages/RahmenPage.jsx).
  if (pathname.replace(/\/+$/, '').toLowerCase() === RAHMEN_PATH) {
    return (
      <ThemeProvider themeId="standard">
        <Suspense fallback={<RouteFallback />}>
          <RahmenPage />
        </Suspense>
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
              <VoucherSessionCard
                family={family}
                code={voucherCode}
                onLogout={handleLogout}
                onClaimed={handleClaimed}
                onVisitConnected={handleVisitConnected}
              />
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
        <SteckbriefPage slug={animalSlug} family={family} />
      </ThemeProvider>
    )
  }

  if (pathname === '/partner') {
    return (
      <ThemeProvider themeId="standard">
        <PartnersPage family={family} />
      </ThemeProvider>
    )
  }

  // "Partner werden" (Phase 5 Task 4): öffentlich wie /partner. Die Demo-Knöpfe melden wie das Portal über
  // handleVoucherLogin an (Familie setzen, zur Startroute des Demo-Partner-Bereichs - /profil).
  if (pathname === PARTNER_INFO_PATH) {
    return (
      <ThemeProvider themeId="standard">
        <Suspense fallback={<RouteFallback />}>
          <PartnerInfoPage onDemo={handleVoucherLogin} family={family} />
        </Suspense>
      </ThemeProvider>
    )
  }

  // Impressum/Datenschutz (Task 7): öffentlich, unabhängig vom Login-Status - wie /partner ein eigener
  // früher Zweig statt einer Route im angemeldeten Bereich, damit sie auch ohne Sitzung erreichbar sind.
  if (pathname === '/impressum' || pathname === '/datenschutz') {
    return (
      <ThemeProvider themeId="standard">
        <LegalPage variant={pathname === '/impressum' ? 'impressum' : 'datenschutz'} family={family} />
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

  // Druckseite der Partner (Phase 5 Task 4): ohne App-Hülle, damit die Bögen wie auf der Admin-Druckseite
  // stehen. Nur Partner-Bereiche - jeder andere Bereich läuft unten in AreaRoutes und landet auf seiner Startseite.
  const partnerPrintBatchId = pathname.match(PARTNER_PRINT_RE)?.[1]
  if (partnerPrintBatchId && isPartnerArea(family)) {
    return (
      <ThemeProvider themeId={family.theme}>
        <Suspense fallback={<RouteFallback />}>
          <PartnerPrintPage batchId={partnerPrintBatchId} readOnly={isReadOnly(family)} demo={Boolean(family.isDemo)} />
        </Suspense>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider themeId={family.theme}>
      {/* Schreibschutz für Demo UND Admin-Ansicht (lib/demo.js readOnlyModeOf liest isDemo/adminView aus me). */}
      <DemoProvider value={family}>
        <div className="app-shell">
          <ScrollToTop />
          {/* Admin-Ansicht vor Demo: öffnet der Admin eine Demo-Familie, zählt der Hinweis der Admin-Ansicht. Beide (und der
              Besuch darunter) stehen per Portal in der schmalen Leiste oben (TopStrip, main.jsx). */}
          {family.adminView ? (
            <AdminViewBanner family={family} onEnd={handleEndAdminView} />
          ) : (
            family.isDemo && (
              <DemoBanner onLeave={handleLeaveDemo} partnerArea={isPartnerArea(family)} compact={Boolean(family.zuBesuch)} />
            )
          )}
          {/* Phase V2: zu Besuch in einem anderen Zuhause - nur ansehen und kommentieren, mit Weg zurück. */}
          {family.zuBesuch && <VisitBanner family={family} />}
          <AppHeader family={family} onLogout={handleLogout} onInvite={openInvite} />
          {/* Partner- und Tierheim-Bereiche: "Bearbeiten | Kundensicht" über jeder Seite (Phase P1). */}
          {isPartnerArea(family) && <ViewModeSwitch areaId={family.id} />}
          {/* key={family.id}: Seiten laden ihre Daten einmalig in useEffect(…, []) – ohne den key
              bliebe beim Wechsel des Bereichs (AreaGate wechselt auf derselben Adresse, z. B. /start aus einer
              Familie heraus) die alte Seiteninstanz samt Daten des vorherigen Bereichs stehen. Der key erzwingt
              ein sauberes Neu-Mounten. */}
          <main className="app-main" key={family.id}>
            {/* Suspense für die erst bei Bedarf geladenen Seiten (AreaRoutes.jsx): nur <main> zeigt beim
                Nachladen RouteFallback, Kopf, Navigation und Fuß bleiben stehen. */}
            {/* Phase U: Rundgang durch eine Partner- oder Tierheim-Demo (schließbar, bleibt dann zu). */}
            {family.isDemo && !family.adminView && isPartnerArea(family) && <PartnerDemoGuide family={family} />}
            <Suspense fallback={<RouteFallback />}>
              <AreaRoutes family={family} onFamilyChange={setFamily} onInvite={openInvite} />
            </Suspense>
          </main>
          <AppFooter family={family} onInvite={openInvite} />
          <Modal open={inviteOpen} title={inviteLabel(family)} onClose={() => setInviteOpen(false)}>
            {inviteOpen && (inviteReady ? <InviteDialog family={family} /> : <RouteFallback />)}
          </Modal>
        </div>
      </DemoProvider>
    </ThemeProvider>
  )
}
