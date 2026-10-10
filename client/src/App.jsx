import { Suspense, useEffect, useLayoutEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { api, setUnauthorizedHandler } from './api'
import { setActiveArea, setAreaMismatchHandler } from './lib/activeArea.js'
import { DemoProvider, isReadOnly } from './lib/demo.js'
import { FINANZIERUNG_PATH, Splash, inAppPublicPage, printRoute, publicRoute, sessionlessRoute } from './TopRoutes.jsx'
import { applyDarstellung, rememberDarstellung, storedDarstellung } from './lib/darstellung.js'
import { START_ROUTE, inviteLabel, isHouseholdIdentity, isPartnerArea, startRoute } from './lib/areas.js'
import { isOwnHome } from './lib/visits.js'
import { MAX_NAV_ITEMS, hasMenuSlot, navItemsFor } from './lib/navItems.js'
import { t } from './lib/i18n/index.js'
import { ThemeProvider, useTheme } from './themes/ThemeProvider.jsx'
import ThemeMark from './components/ThemeMark.jsx'
import Icon from './components/Icon.jsx'
import ScrollToTop from './components/ScrollToTop.jsx'
import AccountMenu from './components/AccountMenu.jsx'
import AccountSheet, { MenuSlotButton } from './components/AccountSheet.jsx'
import SearchButton from './components/search/SearchButton.jsx'
import HinweisGlocke from './components/hinweise/HinweisGlocke.jsx'
import HinweiseProvider from './components/hinweise/HinweiseProvider.jsx'
import { clearRecent } from './lib/search.js'
import { clearFamilyAuswahl } from './lib/bilderrahmen.js'
import useClearDraftsOnSignOut from './hooks/useClearDraftsOnSignOut.js'
import RoleBadge from './components/RoleBadge.jsx'
import DemoBanner from './components/DemoBanner.jsx'
import PartnerDemoGuide from './components/PartnerDemoGuide.jsx'
import AdminViewBanner from './components/AdminViewBanner.jsx'
import NavBadge from './components/NavBadge.jsx'
import ViewModeSwitch from './components/ViewModeSwitch.jsx'
import AreaRoutes from './AreaRoutes.jsx'
import TourProvider from './components/tour/TourProvider.jsx'
import Modal from './components/Modal.jsx'
import InviteDialog from './components/InviteDialog.jsx'
import RouteFallback from './components/RouteFallback.jsx'
import NeueVersionKarte from './components/rudel/NeueVersionKarte.jsx'
import { rememberPersonName } from './lib/profil.js'

// Phase W: "Tiere" bleibt markiert auf den Tierseiten und beim Nachwuchs (/wuerfe).
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
        title={t('Schreib dem Admin')}
      >
        <Icon name="message" />
        <span>{t('Schreib dem Admin')}</span>
      </Link>
      <button type="button" className="icon-btn app-logout" onClick={onLogout} aria-label={t('Abmelden')} title={t('Abmelden')}>
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
        <nav className={`app-nav${navItems.length >= MAX_NAV_ITEMS ? ' app-nav-dense' : ''}`} aria-label={t('Hauptnavigation')}>
          {/* badge/ariaLabel: ungelesene Nachrichten an "Nachrichten" (Phase P2) - offene Anfragen zeigt die Glocke. */}
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
        {/* Suche (Lupe, Strg/⌘+K) für Haushalte und klassische Familien-Logins - Tierheime und Partner haben keine. */}
        {withMenu && <SearchButton family={family} onInvite={onInvite} />}
        {/* Hinweis-Glocke (components/hinweise): Anfragen, neue Gäste, Grüße - nur Haushalte, sonst rendert sie nichts. */}
        <HinweisGlocke />
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
      <p>{theme.footer}</p>
      {partnerArea && (
        <button type="button" className="footer-link" onClick={onInvite}>
          {inviteLabel(family)}
        </button>
      )}
      {/* Audit V7a: auf /umgebung selbst kein Verweis auf dieselbe Seite */}
      {partnerArea && pathname !== '/umgebung' && (
        <Link to="/umgebung" className="footer-link">
          {t('Tierheime & Hundeschulen in der Nähe')} →
        </Link>
      )}
      <span className="app-footer-legal">
        {/* Phase F: „So finanzieren wir uns“ neben Impressum und Datenschutz. */}
        <Link to={FINANZIERUNG_PATH} className="footer-link">
          {t('So finanzieren wir uns')}
        </Link>
        <Link to="/impressum" className="footer-link">
          {t('Impressum')}
        </Link>
        <Link to="/datenschutz" className="footer-link">
          {t('Datenschutz')}
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

  // Darstellung (Einstellungen, lib/darstellung.js): die Wahl der Identität aus /me an <html> - und für das nächste Laden
  // gemerkt (public/darstellung-init.js), außer in Demo und Admin-Ansicht (dort gilt sie nur für diesen Besuch). Ohne
  // Sitzung (abgemeldet, Demo oder Admin-Ansicht beendet) wieder die gemerkte Wahl dieses Geräts.
  // Profil: „Euer Name“ aus /me ist die Vorgabe für den Autor neuer Erinnerungen (lib/profil.js).
  const anzeigename = family?.person?.anzeigename
  useEffect(() => rememberPersonName({ person: { anzeigename } }), [anzeigename])

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

  // Entwürfe neuer Erinnerungen: weg, sobald die Sitzung endet (hooks/useClearDraftsOnSignOut.js).
  useClearDraftsOnSignOut(signedOut)

  // Phase W, Schritt 2: „Einladen“ im Konto-Menü lädt aus dem eigenen Zuhause ein (Zu Besuch einladen, Zuhause
  // verschenken). Aus einer Familie oder einem Besuch heraus geht es dafür erst nach Start - dort wechselt das AreaGate
  // genau einmal nach Hause, erst dann öffnet der Dialog (invitePending). Scheitert der Wechsel, bleibt es beim Hinweis des
  // Gates; wer weitergeht, nimmt den Wunsch nicht mit.
  const inviteReady = !isHouseholdIdentity(family) || isOwnHome(family)
  // invitePending: die Adresse, von der aus "Einladen" gewählt wurde (React-Router navigiert als Transition - bis /start
  // erscheint, steht dort noch die alte Adresse).
  const [invitePending, setInvitePending] = useState(null)
  function openInvite() {
    if (inviteReady) {
      setInviteOpen(true)
      return
    }
    setInvitePending(pathname)
    navigate(START_ROUTE)
  }
  useEffect(() => {
    if (invitePending === null) return
    if (pathname !== START_ROUTE && pathname !== invitePending) setInvitePending(null)
    else if (pathname === START_ROUTE && inviteReady) {
      setInvitePending(null)
      setInviteOpen(true)
    }
  }, [invitePending, inviteReady, pathname])

  async function handleLogout() {
    // Suche: der Verlauf dieses Geräts bleibt nicht über das Abmelden hinaus stehen (lib/search.js clearRecent).
    clearRecent(family)
    // Bilderrahmen: die je Familie gemerkte Auswahl (Tier-Ids) bleibt nicht über das Abmelden hinaus stehen.
    clearFamilyAuswahl()
    try {
      await api.logout()
    } finally {
      setFamily(null)
    }
  }

  // Normale Anmeldung (Schlüssel, Passwort oder Demo): immer auf die Startseite des neuen Bereichs - nicht auf die
  // Adresse, die vor dem Abmelden offen war (Wunsch 05.10.: sonst landet ein anderes Zuhause auf /tier/200 der vorigen
  // Familie und sieht „nicht gefunden“).
  function handleLogin(me) {
    setFamily(me)
    navigate(startRoute(me), { replace: true })
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
  // Seitenwahl oberhalb der App-Hülle (TopRoutes.jsx): erst die Seiten ohne Sitzung, dann - nach /me - Gutschein-Link,
  // öffentliche Seiten und Login, zuletzt die Druckseiten.
  const early = sessionlessRoute({ pathname, search, onDemoStart: handleDemoStart, onEnterAdminView: handleEnterAdminView })
  if (early) return early
  if (family === undefined) return <Splash />
  const handlers = {
    onLogin: handleLogin,
    onVoucherLogin: handleVoucherLogin,
    onLogout: handleLogout,
    onClaimed: handleClaimed,
    onVisitConnected: handleVisitConnected
  }
  const topPage = publicRoute({ pathname, family, voucherCode, handlers }) ?? printRoute(pathname, family)
  if (topPage) return topPage

  const publicPage = inAppPublicPage(pathname, family)
  const onPublicPage = publicPage !== null

  return (
    <ThemeProvider>
      {/* Schreibschutz für Demo UND Admin-Ansicht (lib/demo.js readOnlyModeOf liest isDemo/adminView aus me). */}
      <DemoProvider value={family}>
        <div className="app-shell">
          <ScrollToTop />
          {/* Admin-Ansicht vor Demo: öffnet der Admin eine Demo-Familie, zählt der Hinweis der Admin-Ansicht. Beide (und der
              Besuch darunter) stehen per Portal in der schmalen Leiste oben (TopStrip, main.jsx). */}
          {family.adminView ? (
            <AdminViewBanner family={family} onEnd={handleEndAdminView} />
          ) : (
            family.isDemo && !onPublicPage && <DemoBanner onLeave={handleLeaveDemo} partnerArea={isPartnerArea(family)} />
          )}
          {/* Phase W, Schritt 2: zu Besuch steht ein Chip im Kopf der Besuchsseiten (visits/VisitChip) - kein Band mehr oben. */}
          {/* Hinweis-Glocke: Kopf und Start öffnen dasselbe Fenster (HinweiseProvider), die Zahlen stehen in family. */}
          <HinweiseProvider family={family} onFamilyChange={setFamily}>
            <TourProvider family={family} onFamilyChange={setFamily}>
              <AppHeader family={family} onLogout={handleLogout} onInvite={openInvite} />
              {/* Partner- und Tierheim-Bereiche: "Bearbeiten | Kundensicht" über jeder Seite (Phase P1). */}
              {isPartnerArea(family) && !onPublicPage && <ViewModeSwitch areaId={family.id} />}
              {/* key={family.id}: Seiten laden ihre Daten einmalig in useEffect(…, []) – ohne den key
                  bliebe beim Wechsel des Bereichs (AreaGate wechselt auf derselben Adresse, z. B. /start aus einer
                  Familie heraus) die alte Seiteninstanz samt Daten des vorherigen Bereichs stehen. Der key erzwingt
                  ein sauberes Neu-Mounten. */}
              <main className="app-main" key={family.id}>
                {/* Suspense für die erst bei Bedarf geladenen Seiten (AreaRoutes.jsx): nur <main> zeigt beim
                    Nachladen RouteFallback, Kopf, Navigation und Fuß bleiben stehen. */}
                {/* Phase U: Hinweis in einer Partner- oder Tierheim-Demo - nur auf /profil, einmal je Sitzung, schließbar. */}
                {family.isDemo && !family.adminView && isPartnerArea(family) && !onPublicPage && <PartnerDemoGuide />}
                {/* Rudel-Instanz: „Es gibt eine neue Version“ oben auf dem Start (components/rudel/NeueVersionKarte.jsx). */}
                {family.instanzModus === 'rudel' && [startRoute(family), START_ROUTE].includes(pathname) && <NeueVersionKarte angemeldet />}
                {onPublicPage ? (
                  publicPage
                ) : (
                  <Suspense fallback={<RouteFallback />}>
                    <AreaRoutes family={family} onFamilyChange={setFamily} onInvite={openInvite} />
                  </Suspense>
                )}
              </main>
            </TourProvider>
          </HinweiseProvider>
          <AppFooter family={family} onInvite={openInvite} />
          <Modal open={inviteOpen} title={inviteLabel(family)} onClose={() => setInviteOpen(false)}>
            {inviteOpen && inviteReady && <InviteDialog family={family} />}
          </Modal>
        </div>
      </DemoProvider>
    </ThemeProvider>
  )
}
