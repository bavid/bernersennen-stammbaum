import { lazy } from 'react'
import { Navigate, Route, Routes, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { FAMILIES_ROUTE, areaContext, hasStammbaumStart, parseAreaId, settingsArea, startRoute } from './lib/areas.js'
import AreaGate from './components/AreaGate.jsx'
import LegacyRedirect from './components/LegacyRedirect.jsx'
import StartPage from './pages/StartPage.jsx'
import AnimalsPage from './pages/AnimalsPage.jsx'
import FamiliesPage from './pages/FamiliesPage.jsx'
import GroupPage from './pages/GroupPage.jsx'
import OverviewPage from './pages/OverviewPage.jsx'
import DogDetailPage from './pages/DogDetailPage.jsx'
import ShelterAnimalsPage from './pages/ShelterAnimalsPage.jsx'
import LittersPage from './pages/LittersPage.jsx'
import PinboardPage from './pages/PinboardPage.jsx'
import ContactAdminPage from './pages/ContactAdminPage.jsx'
import NearbyPage from './pages/NearbyPage.jsx'
import DiscoverPage from './pages/DiscoverPage.jsx'
// AccessPage bleibt im Haupt-Chunk: sie ist nur eine Hülle um AccessSettings, das Haushalte über
// FamilySettings ohnehin laden - ein eigener Chunk spart kaum etwas und kostet eine Anfrage mehr.
import AccessPage from './pages/AccessPage.jsx'

// Profil und Kundensicht gibt es nur in Partner- und Tierheim-Bereichen (isPartnerArea) - sie kommen
// erst bei Bedarf als eigener Chunk, damit Haushalte und Rudel sie nicht mitladen. Die Suspense-Grenze
// sitzt in App.jsx um <AreaRoutes> (in <main>), Kopf und Navigation bleiben beim Nachladen stehen.
const PartnerProfilePage = lazy(() => import('./pages/PartnerProfilePage.jsx'))
const CustomerViewPage = lazy(() => import('./pages/CustomerViewPage.jsx'))
// Phase P2: Beiträge und Postfach - ebenso nur für Partner- und Tierheim-Bereiche.
const PartnerPostsPage = lazy(() => import('./pages/PartnerPostsPage.jsx'))
const PartnerInboxPage = lazy(() => import('./pages/PartnerInboxPage.jsx'))
// Phase V4a: der Kalender (Termine und Serien) - ebenso nur für Partner- und Tierheim-Bereiche.
const PartnerCalendarPage = lazy(() => import('./pages/PartnerCalendarPage.jsx'))
// Phase V5: der Visitenkarten-Designer (/visitenkarten) - aus Profil und Kunden-Gutscheinen verlinkt, ohne Navigationspunkt.
const PartnerVisitenkartenPage = lazy(() => import('./pages/PartnerVisitenkartenPage.jsx'))
// Die Fotocollage (samt Seiten-Layout, Canvas-Export und Druckbogen) ruft kaum jemand auf - ebenfalls
// erst bei Bedarf.
const CollagePage = lazy(() => import('./pages/CollagePage.jsx'))
// Mitglieder & Rollen (Phase R): beim klassischen Familien-Login eine eigene Seite (im Konto-Menü), für Haushalte ein
// Reiter der Gruppenseite.
const MembersPage = lazy(() => import('./pages/MembersPage.jsx'))
// Einstellungen (Calm-down-Runde): Darstellung, Familien, Mein Zuhause - eigener Chunk.
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'))
// Digitaler Bilderrahmen (Diashow im eigenen Zuhause) - eigener Chunk, wie die Fotocollage.
const BilderrahmenPage = lazy(() => import('./pages/BilderrahmenPage.jsx'))
// Phase M: ein öffentliches Profil aus „Mein Revier“ (nur angemeldet) - eigener Chunk, selten geöffnet.
const RevierProfilPage = lazy(() => import('./pages/RevierProfilPage.jsx'))

// Alte /hund/:id-Links (vor der Umbenennung zu /tier/:id geteilt) funktionieren weiter
function RedirectTierUrl() {
  const { id } = useParams()
  const { hash } = useLocation()
  return <Navigate to={`/tier/${id}${hash}`} replace />
}

// Phase W, Schritt 2: "In der Nähe" ist für Haushalte der Reiter "Karte" in Entdecken - alte Links auf /umgebung landen
// dort, Query und Hash bleiben.
function NearbyRedirect() {
  const { search, hash } = useLocation()
  const params = new URLSearchParams(search)
  params.set('bereich', 'karte')
  return <Navigate to={`/entdecken?${params}${hash}`} replace />
}

// Bestandsrudel mit Stammbaum als Start (lib/areas.js hasStammbaumStart): /stammbaum ist hier eine eigene Seite - die
// Tiere-Seite des neuen Systems, geöffnet auf dem Reiter "Stammbaum" (?ansicht=stammbaum); alle anderen leitet
// LegacyRedirect weiter.
function StammbaumRoute({ family }) {
  const { search, hash } = useLocation()
  if (!hasStammbaumStart(family)) return <LegacyRedirect family={family} kind="tree" />
  const params = new URLSearchParams(search)
  if (!params.has('ansicht')) {
    params.set('ansicht', 'stammbaum')
    return <Navigate to={`/stammbaum?${params}${hash}`} replace />
  }
  return <AnimalsPage family={family} />
}

function ToStart({ family }) {
  return <Navigate to={startRoute(family)} replace />
}

// /familien/:id - die Gruppenseite im Bereich :id (das Gate wechselt bei Bedarf); das eigene Zuhause hat keine.
function GroupRoute({ family, onFamilyChange }) {
  const { id } = useParams()
  if (parseAreaId(id) === (family.home?.id ?? family.id)) return <Navigate to={FAMILIES_ROUTE} replace />
  return (
    <AreaGate family={family} need={id} onFamilyChange={onFamilyChange}>
      <GroupPage family={family} onFamilyChange={onFamilyChange} />
    </AreaGate>
  )
}

// /tier/:id - mit ?in=<Bereich> im genannten Bereich (z. B. aus einem bereichsübergreifenden Feed), mit ?in=home im eigenen
// Zuhause ("In „Mein Zuhause“ bearbeiten" auf einem hierher geteilten Tier), sonst im aktiven.
function tierArea(value) {
  return value === 'home' ? 'home' : parseAreaId(value)
}

function TierRoute({ family, onFamilyChange }) {
  const [searchParams] = useSearchParams()
  const inArea = tierArea(searchParams.get('in'))
  const page = <DogDetailPage family={family} onFamilyChange={onFamilyChange} />
  if (!inArea) return page
  return (
    <AreaGate family={family} need={inArea} onFamilyChange={onFamilyChange}>
      {page}
    </AreaGate>
  )
}

// /einstellungen - im eigenen Zuhause; Einstellungen › Familien › [Familie] (?bereich=familien&familie=<Id>, Phase W
// Schritt 2) in der genannten Familie, aber nur einer eigenen Mitgliedschaft (lib/areas.js settingsArea).
function SettingsRoute({ family, onFamilyChange, onInvite }) {
  const [searchParams] = useSearchParams()
  return (
    <AreaGate family={family} need={settingsArea(family, searchParams)} onFamilyChange={onFamilyChange}>
      <SettingsPage family={family} onFamilyChange={onFamilyChange} onInvite={onInvite} />
    </AreaGate>
  )
}

// /pinnwand - die Pinnwand des eigenen Zuhauses (beim klassischen Login: der Familie). In einer Familie führt die alte Adresse
// zu deren Reiter - außer mit ?in=home (ein Zettel des Zuhauses aus der Suche): dann wechselt das Gate nach Hause.
function PinboardRoute({ family, onFamilyChange }) {
  const [searchParams] = useSearchParams()
  if (areaContext(family) === 'group' && searchParams.get('in') !== 'home') return <LegacyRedirect family={family} kind="pinnwand" />
  return (
    <AreaGate family={family} need="home" onFamilyChange={onFamilyChange}>
      <PinboardPage family={family} />
    </AreaGate>
  )
}

// /bilderrahmen - die Diashow im eigenen Zuhause; mit ?in=<Familie> die Fotos einer Familie (Gruppenseite „Bilderrahmen“,
// B+ Familienalbum) - das Gate wechselt dorthin, der Server zeigt genau, was der Bereich sieht.
function BilderrahmenRoute({ family, onFamilyChange }) {
  const [searchParams] = useSearchParams()
  const requested = parseAreaId(searchParams.get('in'))
  // ?in=<das eigene Zuhause> ist kein Wechsel - wie ohne Angabe (gemerkte Auswahl des Zuhauses, private auf Wunsch).
  const inArea = requested === (family.home?.id ?? family.id) ? null : requested
  return (
    <AreaGate family={family} need={inArea || 'home'} onFamilyChange={onFamilyChange}>
      <BilderrahmenPage areaKey={inArea} />
    </AreaGate>
  )
}

// Partner-Bereich (Phase P, family.art 'partner' - Hundeschule, Hundesalon, Betreuung, …): keine Tiere,
// keine Chronik, kein Rudel - nur Profil, Beiträge und Nachrichten (P2), Kalender (V4a), Visitenkarten (V5), Zugang und die Kundensicht, dazu
// die allgemeinen Seiten aus Kopf und Fuß (Schreib dem Admin, In der Nähe). Alles andere (Stammbaum,
// Pinnwand, Wegbegleiter, Entdecken, …) führt zurück zum Profil.
function PartnerAreaRoutes({ family, onFamilyChange }) {
  return (
    <Routes>
      <Route path="/profil" element={<PartnerProfilePage family={family} />} />
      <Route path="/beitraege" element={<PartnerPostsPage family={family} />} />
      <Route path="/kalender" element={<PartnerCalendarPage family={family} />} />
      <Route path="/visitenkarten" element={<PartnerVisitenkartenPage />} />
      <Route path="/nachrichten" element={<PartnerInboxPage family={family} onFamilyChange={onFamilyChange} />} />
      <Route path="/zugang" element={<AccessPage family={family} onFamilyChange={onFamilyChange} />} />
      <Route path="/kundensicht" element={<CustomerViewPage family={family} />} />
      <Route path="/admin-schreiben" element={<ContactAdminPage />} />
      <Route path="/umgebung" element={<NearbyPage />} />
      <Route path="*" element={<ToStart family={family} />} />
    </Routes>
  )
}

// Tierheime (Phase T/P, unverändert durch Phase W): "Unsere Tiere" als Start, Pinnwand, Collage, Profil und Nachrichten.
function ShelterRoutes({ family, onFamilyChange, onInvite }) {
  return (
    <Routes>
      <Route path="/tiere" element={<ShelterAnimalsPage family={family} />} />
      <Route path="/stammbaum" element={<OverviewPage family={family} onFamilyChange={onFamilyChange} onInvite={onInvite} />} />
      <Route path="/familienbande" element={<OverviewPage family={family} onFamilyChange={onFamilyChange} onInvite={onInvite} />} />
      <Route path="/tier/:id" element={<DogDetailPage family={family} onFamilyChange={onFamilyChange} />} />
      <Route path="/hund/:id" element={<RedirectTierUrl />} />
      <Route path="/pinnwand" element={<PinboardPage family={family} />} />
      <Route path="/wuerfe" element={<LittersPage family={family} />} />
      <Route path="/zuchtbuch" element={<Navigate to="/wuerfe" replace />} />
      <Route path="/admin-schreiben" element={<ContactAdminPage />} />
      <Route path="/collage" element={<CollagePage family={family} />} />
      <Route path="/umgebung" element={<NearbyPage />} />
      {/* Profil/Zugang/Kundensicht (Phase P) auch für Tierheime - die sind ebenfalls Partner-Bereiche. */}
      <Route path="/profil" element={<PartnerProfilePage family={family} />} />
      <Route path="/zugang" element={<AccessPage family={family} onFamilyChange={onFamilyChange} />} />
      <Route path="/kundensicht" element={<CustomerViewPage family={family} />} />
      {/* Phase P2/V4a/V5: Beiträge und Kalender stehen als Reiter im Profil, die Seiten bleiben erreichbar. */}
      <Route path="/beitraege" element={<PartnerPostsPage family={family} />} />
      <Route path="/kalender" element={<PartnerCalendarPage family={family} />} />
      <Route path="/visitenkarten" element={<PartnerVisitenkartenPage />} />
      <Route path="/nachrichten" element={<PartnerInboxPage family={family} onFamilyChange={onFamilyChange} />} />
      <Route path="*" element={<ToStart family={family} />} />
    </Routes>
  )
}

// Zu Besuch in einem anderen Zuhause (Phase V2, family.zuBesuch): nur dessen Gruppenseite (nur lesen) und die Tierseiten
// (dort darf man kommentieren). Phase W: jede andere Adresse wechselt über das Gate zurück ins eigene Zuhause - danach
// zeigt die Tabelle des Haushalts dieselbe Adresse. Alte Adressen (Wegbegleiter, Stammbaum) führen auf die Gruppenseite.
function VisitRoutes({ family, onFamilyChange }) {
  return (
    <Routes>
      <Route path="/familien/:id" element={<GroupRoute family={family} onFamilyChange={onFamilyChange} />} />
      <Route path="/tier/:id" element={<TierRoute family={family} onFamilyChange={onFamilyChange} />} />
      <Route path="/hund/:id" element={<RedirectTierUrl />} />
      <Route path="/wegbegleiter" element={<LegacyRedirect family={family} kind="wegbegleiter" />} />
      <Route path="/stammbaum" element={<LegacyRedirect family={family} kind="tree" />} />
      <Route path="/familienbande" element={<LegacyRedirect family={family} kind="tree" />} />
      <Route path="*" element={<AreaGate family={family} need="home" onFamilyChange={onFamilyChange} />} />
    </Routes>
  )
}

// Phase W (Ruhige Hülle): Haushalte (im eigenen Zuhause oder in einer ihrer Familien) und klassische Familien-Logins.
// Start, Tiere, Familien, Entdecken, Einstellungen und Fotocollage spielen im eigenen Zuhause (Gate "home"; beim
// klassischen Login ist das die Familie selbst), die Gruppenseite im Bereich aus der Adresse. Alte Adressen leiten
// weiter (LegacyRedirect, lib/legacyRoutes.js).
function HouseholdRoutes({ family, onFamilyChange, onInvite }) {
  const context = areaContext(family)
  const household = context !== 'classic'
  const atHome = (element) => (
    <AreaGate family={family} need="home" onFamilyChange={onFamilyChange}>
      {element}
    </AreaGate>
  )
  return (
    <Routes>
      <Route path="/start" element={atHome(<StartPage family={family} onFamilyChange={onFamilyChange} />)} />
      <Route path="/tiere" element={atHome(<AnimalsPage family={family} />)} />
      <Route
        path="/familien"
        element={household ? atHome(<FamiliesPage family={family} onFamilyChange={onFamilyChange} />) : <ToStart family={family} />}
      />
      <Route
        path="/familien/:id"
        element={household ? <GroupRoute family={family} onFamilyChange={onFamilyChange} /> : <ToStart family={family} />}
      />
      <Route path="/tier/:id" element={<TierRoute family={family} onFamilyChange={onFamilyChange} />} />
      <Route path="/hund/:id" element={<RedirectTierUrl />} />
      <Route path="/wegbegleiter" element={<LegacyRedirect family={family} kind="wegbegleiter" />} />
      <Route path="/stammbaum" element={<StammbaumRoute family={family} />} />
      <Route path="/familienbande" element={<LegacyRedirect family={family} kind="tree" />} />
      {/* Entscheidung D2: die Pinnwand des Zuhauses hat keinen Menüpunkt (Start verlinkt sie), die einer Familie ist ein
          Reiter der Gruppenseite; beim klassischen Login bleibt sie in der Navigation. */}
      <Route path="/pinnwand" element={<PinboardRoute family={family} onFamilyChange={onFamilyChange} />} />
      <Route
        path="/mitglieder"
        element={
          context === 'classic' ? (
            <MembersPage family={family} onFamilyChange={onFamilyChange} />
          ) : (
            <LegacyRedirect family={family} kind="mitglieder" />
          )
        }
      />
      <Route path="/wuerfe" element={<LittersPage family={family} />} />
      <Route path="/zuchtbuch" element={<Navigate to="/wuerfe" replace />} />
      <Route path="/einstellungen" element={<SettingsRoute family={family} onFamilyChange={onFamilyChange} onInvite={onInvite} />} />
      <Route path="/admin-schreiben" element={<ContactAdminPage />} />
      <Route path="/collage" element={atHome(<CollagePage family={family} />)} />
      <Route path="/bilderrahmen" element={<BilderrahmenRoute family={family} onFamilyChange={onFamilyChange} />} />
      <Route path="/umgebung" element={<NearbyRedirect />} />
      <Route path="/entdecken" element={atHome(<DiscoverPage />)} />
      <Route path="/revier/:slug" element={atHome(<RevierProfilPage />)} />
      <Route path="*" element={<ToStart family={family} />} />
    </Routes>
  )
}

// Routen des angemeldeten Bereichs (App.jsx, unter <main key={family.id}>) je Bereichsart.
export default function AreaRoutes({ family, onFamilyChange, onInvite }) {
  if (family.art === 'partner') return <PartnerAreaRoutes family={family} onFamilyChange={onFamilyChange} />
  if (family.art === 'tierheim') return <ShelterRoutes family={family} onFamilyChange={onFamilyChange} onInvite={onInvite} />
  if (family.zuBesuch) return <VisitRoutes family={family} onFamilyChange={onFamilyChange} />
  return <HouseholdRoutes family={family} onFamilyChange={onFamilyChange} onInvite={onInvite} />
}
