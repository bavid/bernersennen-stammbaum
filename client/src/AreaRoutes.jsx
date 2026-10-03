import { lazy } from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { isPartnerArea, startRoute } from './lib/areas.js'
import OverviewPage from './pages/OverviewPage.jsx'
import DogDetailPage from './pages/DogDetailPage.jsx'
import CompanionsPage from './pages/CompanionsPage.jsx'
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
// Mitglieder & Rollen (Phase R): nur in Familien (art 'rudel'), erreichbar über Stammbaum-Hinweis,
// Einstellungen und Bereichswechsler - die Rudel-Navigation ist mit fünf Einträgen voll (lib/navItems.js).
const MembersPage = lazy(() => import('./pages/MembersPage.jsx'))

// Alte /hund/:id-Links (vor der Umbenennung zu /tier/:id geteilt) funktionieren weiter
function RedirectTierUrl() {
  const { id } = useParams()
  const { hash } = useLocation()
  return <Navigate to={`/tier/${id}${hash}`} replace />
}

function ToStart({ family }) {
  return <Navigate to={startRoute(family)} replace />
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

// Zu Besuch in einem anderen Zuhause (Phase V2, family.zuBesuch): nur ansehen - Wegbegleiter, Stammbaum und die
// Tierseiten (dort darf man kommentieren). Alles andere (Pinnwand, Collage, Entdecken, Würfe, Schreib dem Admin,
// In der Nähe, ...) führt zurück zu den Wegbegleitern - der Server sperrt es für Gäste ohnehin (Kopf und Fuß
// blenden die Links dazu während eines Besuchs aus).
function VisitRoutes({ family, onFamilyChange }) {
  return (
    <Routes>
      <Route path="/wegbegleiter" element={<CompanionsPage family={family} />} />
      <Route path="/stammbaum" element={<OverviewPage family={family} onFamilyChange={onFamilyChange} />} />
      <Route path="/familienbande" element={<OverviewPage family={family} onFamilyChange={onFamilyChange} />} />
      <Route path="/tier/:id" element={<DogDetailPage family={family} onFamilyChange={onFamilyChange} />} />
      <Route path="/hund/:id" element={<RedirectTierUrl />} />
      <Route path="*" element={<ToStart family={family} />} />
    </Routes>
  )
}

// Routen des angemeldeten Bereichs (App.jsx, unter <main key={family.id}>) je Bereichsart: Zuhause,
// Rudel und Tierheim teilen sich eine Tabelle mit Weichen je art, der Partner-Bereich hat eine eigene.
export default function AreaRoutes({ family, onFamilyChange, onInvite }) {
  if (family.art === 'partner') return <PartnerAreaRoutes family={family} onFamilyChange={onFamilyChange} />
  if (family.zuBesuch) return <VisitRoutes family={family} onFamilyChange={onFamilyChange} />

  const partnerArea = isPartnerArea(family)
  return (
    <Routes>
      <Route path="/stammbaum" element={<OverviewPage family={family} onFamilyChange={onFamilyChange} onInvite={onInvite} />} />
      {/* Phase U: /familienbande ist derselbe Stammbaum unter dem Namen des Standard-Auftritts (Links bleiben /stammbaum). */}
      <Route path="/familienbande" element={<OverviewPage family={family} onFamilyChange={onFamilyChange} onInvite={onInvite} />} />
      <Route path="/tier/:id" element={<DogDetailPage family={family} onFamilyChange={onFamilyChange} />} />
      <Route path="/hund/:id" element={<RedirectTierUrl />} />
      <Route
        path="/wegbegleiter"
        element={family.art === 'zuhause' ? <CompanionsPage family={family} onFamilyChange={onFamilyChange} /> : <ToStart family={family} />}
      />
      <Route path="/tiere" element={family.art === 'tierheim' ? <ShelterAnimalsPage family={family} /> : <ToStart family={family} />} />
      <Route path="/pinnwand" element={<PinboardPage family={family} />} />
      <Route path="/wuerfe" element={<LittersPage family={family} />} />
      <Route
        path="/mitglieder"
        element={family.art === 'rudel' ? <MembersPage family={family} onFamilyChange={onFamilyChange} /> : <ToStart family={family} />}
      />
      <Route path="/zuchtbuch" element={<Navigate to="/wuerfe" replace />} />
      <Route path="/admin-schreiben" element={<ContactAdminPage />} />
      <Route path="/collage" element={<CollagePage family={family} />} />
      <Route path="/umgebung" element={<NearbyPage />} />
      <Route path="/entdecken" element={family.art === 'tierheim' ? <ToStart family={family} /> : <DiscoverPage />} />
      {/* Profil/Zugang/Kundensicht (Phase P) auch für Tierheime - die sind ebenfalls Partner-Bereiche. */}
      <Route path="/profil" element={partnerArea ? <PartnerProfilePage family={family} /> : <ToStart family={family} />} />
      <Route
        path="/zugang"
        element={partnerArea ? <AccessPage family={family} onFamilyChange={onFamilyChange} /> : <ToStart family={family} />}
      />
      <Route path="/kundensicht" element={partnerArea ? <CustomerViewPage family={family} /> : <ToStart family={family} />} />
      {/* Phase P2: Tierheime haben "Nachrichten" in der Navigation, die Beiträge als Reiter im Profil - die
          eigene Seite /beitraege bleibt trotzdem erreichbar (z. B. über einen gemerkten Link). */}
      <Route path="/beitraege" element={partnerArea ? <PartnerPostsPage family={family} /> : <ToStart family={family} />} />
      {/* Phase V4a: bei Tierheimen steht der Kalender als Reiter im Profil - /kalender bleibt trotzdem erreichbar. */}
      <Route path="/kalender" element={partnerArea ? <PartnerCalendarPage family={family} /> : <ToStart family={family} />} />
      {/* Phase V5: Visitenkarten auch für Tierheime (Link im Profil-Reiter "Teilen"). */}
      <Route path="/visitenkarten" element={partnerArea ? <PartnerVisitenkartenPage /> : <ToStart family={family} />} />
      <Route
        path="/nachrichten"
        element={partnerArea ? <PartnerInboxPage family={family} onFamilyChange={onFamilyChange} /> : <ToStart family={family} />}
      />
      <Route path="*" element={<ToStart family={family} />} />
    </Routes>
  )
}
