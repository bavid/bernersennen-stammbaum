import { lazy, Suspense } from 'react'
import { isReadOnly } from './lib/demo.js'
import { isPartnerArea } from './lib/areas.js'
import { STARTPAKET_RE } from './lib/startpaket.js'
import { VERMISST_RE } from './lib/vermisst.js'
import { FOTOBUCH_RE } from './lib/fotobuch.js'
import { ThemeProvider } from './themes/ThemeProvider.jsx'
import ThemeMark from './components/ThemeMark.jsx'
import RouteFallback from './components/RouteFallback.jsx'
import VoucherSessionCard from './components/VoucherSessionCard.jsx'
// LoginEntry: volle Startseite oder - im Instanz-Modus „rudel“ - nur der Passwort-Login (lib/instanzModus.js).
import LoginEntry from './components/login/LoginEntry.jsx'
import PartnerPortalPage from './pages/PartnerPortalPage.jsx'
import PartnersPage from './pages/PartnersPage.jsx'
import SteckbriefPage from './pages/SteckbriefPage.jsx'
import LegalPage from './pages/LegalPage.jsx'

// Seitenwahl oberhalb der App-Hülle (aus App.jsx ausgelagert): Admin, Druckseiten, öffentliche Seiten, Login. Jede
// Funktion liefert ein fertiges Element oder null - dann geht es in App.jsx weiter zur nächsten Stufe bzw. zur Hülle.

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
// Tierheim-Startpaket (/tier/:id/startpaket, lib/startpaket.js): Druckmappe zur Vermittlung, nur Tierheim-Bereiche.
const StartpaketPage = lazy(() => import('./pages/StartpaketPage.jsx'))
// Suchplakat (/tier/:id/vermisst, lib/vermisst.js): nur im Zuhause, ohne App-Hülle.
const VermisstPage = lazy(() => import('./pages/VermisstPage.jsx'))
// Chronik als Fotobuch (/tier/:id/fotobuch, lib/fotobuch.js): Druckseite für alle, die die Chronik sehen.
const FotobuchPage = lazy(() => import('./pages/FotobuchPage.jsx'))
// Öffentliche Infoseite "Partner werden" (Phase 5 Task 4): selten aufgerufen, eigener Chunk.
const PartnerInfoPage = lazy(() => import('./pages/PartnerInfoPage.jsx'))
// Phase F: „So finanzieren wir uns“ (/finanzierung) - öffentlich wie Impressum und Datenschutz, eigener Chunk.
const FinanzierungPage = lazy(() => import('./pages/FinanzierungPage.jsx'))
// „Als App aufs Handy“ (/app): die Anleitung je Gerät - öffentlich wie /finanzierung, eigener Chunk.
const AppPage = lazy(() => import('./pages/AppPage.jsx'))
// Präsentation zum Durchklicken (/vorstellung): öffentlich wie /app, eigener Chunk.
const VorstellungPage = lazy(() => import('./pages/VorstellungPage.jsx'))
// Netzwerk-Präsentation (/netzwerk, lib/netzwerk.js NETZWERK_PATH): Entwurf, wie Partner sich vernetzen - eigener Chunk.
const NetzwerkPage = lazy(() => import('./pages/NetzwerkPage.jsx'))
// Präsentationsmodus (Phase 5 Task 5): Vorführseite des Admins mit Kacheln, die je eine Demo in einem neuen
// Tab starten - dort landet man auf /demo-start (DemoStartPage), das POST /api/demo ruft. Beides eigene Chunks.
const AdminPresentPage = lazy(() => import('./pages/AdminPresentPage.jsx'))
// Box-System: Katalog der Bausteine (/admin/bausteine), eigener Chunk.
const AdminBausteinePage = lazy(() => import('./pages/AdminBausteinePage.jsx'))
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
const ADMIN_BAUSTEINE_RE = /^\/admin\/bausteine\/?$/

// /demo-start?as=…&slug=…&ziel=… - Einstieg hinter jeder Kachel des Präsentationsmodus (lib/present.js).
const DEMO_START_PATH = '/demo-start'

// /rahmen#TOKEN - Bilderrahmen auf einem anderen Gerät (RahmenPage; dieselbe Adresse wie lib/rahmenGeraet.js RAHMEN_PATH).
const RAHMEN_PATH = '/rahmen'

// /partner-drucken/<stapel-id> - Druckseite eines Kunden-Gutschein-Stapels aus dem Partner-Profil (Reiter
// "Kunden-Gutscheine"); nur mit Sitzung in einem Partner- oder Tierheim-Bereich, sonst Login bzw. Startseite.
const PARTNER_PRINT_RE = /^\/partner-drucken\/(\d+)\/?$/

// Öffentliche Infoseite für künftige Partner (PartnerInfoPage), verlinkt von Login-Seite und Partnerliste.
const PARTNER_INFO_PATH = '/partner-werden'

// Phase F: „So finanzieren wir uns“ (FinanzierungPage), verlinkt von Login-Seite, App-Fuß, Datenschutz und /partner-werden.
export const FINANZIERUNG_PATH = '/finanzierung'
// „Als App aufs Handy“ - Anleitung zum Installieren (pages/AppPage.jsx APP_PATH).
const APP_PATH = '/app'
// Präsentation zum Durchklicken (pages/VorstellungPage.jsx, lib/vorstellung.js VORSTELLUNG_PATH).
const VORSTELLUNG_PATH = '/vorstellung'
const NETZWERK_PATH = '/netzwerk'

// Öffentliche Partnerliste (PartnersPage).
const PARTNER_LIST_PATH = '/partner'

// /p/<slug> – öffentliches Partner-Portal, unabhängig von Groß-/Kleinschreibung des Pfads egal (der
// Slug selbst bleibt roh, die Route validiert nur die Form).
const PARTNER_SLUG_RE = /^\/p\/([^/]+)\/?$/

// /t/<slug> – öffentlicher Steckbrief eines Tiers (Phase T Task 5), derselbe Aufbau wie PARTNER_SLUG_RE.
const ANIMAL_SLUG_RE = /^\/t\/([^/]+)\/?$/

function Themed({ children }) {
  return <ThemeProvider>{children}</ThemeProvider>
}

function ThemedLazy({ children }) {
  return (
    <ThemeProvider>
      <Suspense fallback={<RouteFallback />}>{children}</Suspense>
    </ThemeProvider>
  )
}

// Stufe 1 - unabhängig von jeder Sitzung, noch bevor /me antwortet.
// Admin-Bereich hat einen eigenen Login, unabhängig vom Rudel-Login, immer im Standard-Auftritt.
// Demo-Einstieg des Präsentationsmodus (Phase 5 Task 5) und Admin-Ansicht eines Bereichs (Phase 5 Task 5b): die Seite
// ersetzt eine laufende Sitzung durch die Demo- bzw. Nur-Lesen-Sitzung (onDemoStart, onEnterAdminView).
// Bilderrahmen auf einem anderen Gerät (z. B. Omas Tablet): sofort ohne auf /me zu warten - die Seite holt ihre Fotos
// allein mit dem Token des Rahmen-Links (pages/RahmenPage.jsx).
export function sessionlessRoute({ pathname, search, onDemoStart, onEnterAdminView }) {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const printBatchId = pathname.match(ADMIN_PRINT_RE)?.[1]
    const isPresent = ADMIN_PRESENT_RE.test(pathname)
    const adminPage = ADMIN_BAUSTEINE_RE.test(pathname) ? <AdminBausteinePage /> : <AdminPage />
    return (
      <ThemedLazy>{printBatchId ? <AdminPrintPage batchId={printBatchId} /> : isPresent ? <AdminPresentPage /> : adminPage}</ThemedLazy>
    )
  }
  if (pathname === DEMO_START_PATH) {
    return (
      <ThemedLazy>
        <DemoStartPage search={search} onEntered={onDemoStart} />
      </ThemedLazy>
    )
  }
  const adminViewId = pathname.match(ADMIN_VIEW_RE)?.[1]
  if (adminViewId) {
    return (
      <ThemedLazy>
        <AdminViewStartPage familyId={adminViewId} onEntered={onEnterAdminView} />
      </ThemedLazy>
    )
  }
  if (pathname.replace(/\/+$/, '').toLowerCase() === RAHMEN_PATH) {
    return (
      <ThemedLazy>
        <RahmenPage />
      </ThemedLazy>
    )
  }
  return null
}

export function Splash() {
  return (
    <ThemeProvider>
      <div className="splash" aria-busy="true">
        <ThemeMark size={72} />
      </div>
    </ThemeProvider>
  )
}

// Öffentlicher Gutschein-Link (Karte, QR): /v#CODE. Mit bestehender Sitzung erst abmelden lassen – der Code bleibt
// dabei in voucherCode (App.jsx) "im Speicher" und geht in die Login-Seite, sobald family null ist.
function VoucherRoute({ family, voucherCode, handlers }) {
  return (
    <Themed>
      {family ? (
        <div className="login voucher-session">
          <section className="login-panel">
            <VoucherSessionCard
              family={family}
              code={voucherCode}
              onLogout={handlers.onLogout}
              onClaimed={handlers.onClaimed}
              onVisitConnected={handlers.onVisitConnected}
            />
          </section>
        </div>
      ) : (
        <LoginEntry onLogin={handlers.onVoucherLogin} initialMode="redeem" initialCode={voucherCode} />
      )}
    </Themed>
  )
}

// Partner-Portal (/p/:slug), Steckbrief (/t/:slug, Phase T Task 5) und Partnerliste (/partner): öffentlich - ohne
// Sitzung wie /v je ein eigener früher Zweig mit dem schlanken öffentlichen Kopf. Feedback-Runde: angemeldet stehen sie
// in der normalen Hülle der App (ein Kopf, ein Fuß - nicht doppelt), ohne Demo-Hinweis (inAppPublicPage).
function publicSlugsOf(pathname) {
  return {
    partnerSlug: pathname.match(PARTNER_SLUG_RE)?.[1],
    animalSlug: pathname.match(ANIMAL_SLUG_RE)?.[1],
    onPartnerList: pathname === PARTNER_LIST_PATH
  }
}

// Öffentliche Infoseiten, mit oder ohne Sitzung: "Partner werden" (Phase 5 Task 4; die Demo-Knöpfe melden über
// onVoucherLogin an), „So finanzieren wir uns“ (Phase F), „Als App aufs Handy“, die Präsentationen (/vorstellung,
// /netzwerk) und Impressum/Datenschutz (Task 7: eigener früher Zweig, damit sie auch ohne Sitzung erreichbar sind).
function infoRoute(pathname, family, onVoucherLogin) {
  const lazyPages = {
    [PARTNER_INFO_PATH]: () => <PartnerInfoPage onDemo={onVoucherLogin} family={family} />,
    [FINANZIERUNG_PATH]: () => <FinanzierungPage family={family} />,
    [APP_PATH]: () => <AppPage family={family} />,
    [VORSTELLUNG_PATH]: () => <VorstellungPage family={family} />,
    [NETZWERK_PATH]: () => <NetzwerkPage family={family} />
  }
  if (Object.prototype.hasOwnProperty.call(lazyPages, pathname)) return <ThemedLazy>{lazyPages[pathname]()}</ThemedLazy>
  if (pathname === '/impressum' || pathname === '/datenschutz') {
    return (
      <Themed>
        <LegalPage variant={pathname === '/impressum' ? 'impressum' : 'datenschutz'} family={family} />
      </Themed>
    )
  }
  return null
}

// Stufe 2 - nach der Antwort von /me (family ist null oder angemeldet): Gutschein-Link, öffentliche Seiten und ohne
// Sitzung der Login. handlers: onLogin, onVoucherLogin, onLogout, onClaimed, onVisitConnected (App.jsx).
export function publicRoute({ pathname, family, voucherCode, handlers }) {
  if (pathname === '/v') return <VoucherRoute family={family} voucherCode={voucherCode} handlers={handlers} />
  const { partnerSlug, animalSlug, onPartnerList } = publicSlugsOf(pathname)
  if (!family && (partnerSlug || animalSlug || onPartnerList)) {
    return (
      <Themed>
        {partnerSlug ? <PartnerPortalPage slug={partnerSlug} /> : animalSlug ? <SteckbriefPage slug={animalSlug} /> : <PartnersPage />}
      </Themed>
    )
  }
  const info = infoRoute(pathname, family, handlers.onVoucherLogin)
  if (info) return info
  if (!family) {
    return (
      <Themed>
        <LoginEntry onLogin={handlers.onLogin} />
      </Themed>
    )
  }
  return null
}

// Stufe 3 - Druckseiten ohne App-Hülle, nur mit Sitzung. Druckseite der Partner (Phase 5 Task 4): nur Partner-Bereiche,
// damit die Bögen wie auf der Admin-Druckseite stehen. Tierheim-Startpaket, Suchplakat (nur im Zuhause) und Fotobuch.
// Jeder andere Bereich läuft in AreaRoutes und landet auf seiner Startseite.
export function printRoute(pathname, family) {
  const partnerPrintBatchId = pathname.match(PARTNER_PRINT_RE)?.[1]
  if (partnerPrintBatchId && isPartnerArea(family)) {
    return (
      <ThemedLazy>
        <PartnerPrintPage batchId={partnerPrintBatchId} readOnly={isReadOnly(family)} demo={Boolean(family.isDemo)} />
      </ThemedLazy>
    )
  }
  const startpaketDogId = pathname.match(STARTPAKET_RE)?.[1]
  const vermisstDogId = family.art === 'zuhause' ? pathname.match(VERMISST_RE)?.[1] : null
  const fotobuchDogId = pathname.match(FOTOBUCH_RE)?.[1]
  if ((startpaketDogId && family.art === 'tierheim') || vermisstDogId || fotobuchDogId) {
    return (
      <ThemedLazy>
        {fotobuchDogId ? <FotobuchPage dogId={fotobuchDogId} /> : vermisstDogId ? <VermisstPage dogId={vermisstDogId} family={family} /> : <StartpaketPage dogId={startpaketDogId} family={family} />}
      </ThemedLazy>
    )
  }
  return null
}

// Feedback-Runde: Portal, Steckbrief und Partnerliste gehören dem Partner bzw. allen - angemeldet in der Hülle ohne
// Demo-Hinweis, Demo-Rundgang und "Bearbeiten | Kundensicht" (die gelten dem eigenen Bereich). Sonst null.
export function inAppPublicPage(pathname, family) {
  const { partnerSlug, animalSlug, onPartnerList } = publicSlugsOf(pathname)
  if (partnerSlug) return <PartnerPortalPage slug={partnerSlug} inApp family={family} />
  if (animalSlug) return <SteckbriefPage slug={animalSlug} inApp />
  if (onPartnerList) return <PartnersPage inApp />
  return null
}
