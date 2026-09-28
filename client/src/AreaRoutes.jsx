import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { isPartnerArea, startRoute } from './lib/areas.js'
import OverviewPage from './pages/OverviewPage.jsx'
import DogDetailPage from './pages/DogDetailPage.jsx'
import CompanionsPage from './pages/CompanionsPage.jsx'
import ShelterAnimalsPage from './pages/ShelterAnimalsPage.jsx'
import LittersPage from './pages/LittersPage.jsx'
import CollagePage from './pages/CollagePage.jsx'
import PinboardPage from './pages/PinboardPage.jsx'
import ContactAdminPage from './pages/ContactAdminPage.jsx'
import NearbyPage from './pages/NearbyPage.jsx'
import DiscoverPage from './pages/DiscoverPage.jsx'
import PartnerProfilePage from './pages/PartnerProfilePage.jsx'
import AccessPage from './pages/AccessPage.jsx'

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
// keine Chronik, kein Rudel - nur Profil und Zugang, dazu die allgemeinen Seiten aus Kopf und Fuß
// (Schreib dem Admin, In der Nähe). Alles andere (Stammbaum, Pinnwand, Wegbegleiter, Entdecken, …)
// führt zurück zum Profil.
function PartnerAreaRoutes({ family, onFamilyChange }) {
  return (
    <Routes>
      <Route path="/profil" element={<PartnerProfilePage family={family} />} />
      <Route path="/zugang" element={<AccessPage family={family} onFamilyChange={onFamilyChange} />} />
      <Route path="/admin-schreiben" element={<ContactAdminPage />} />
      <Route path="/umgebung" element={<NearbyPage />} />
      <Route path="*" element={<ToStart family={family} />} />
    </Routes>
  )
}

// Routen des angemeldeten Bereichs (App.jsx, unter <main key={family.id}>) je Bereichsart: Zuhause,
// Rudel und Tierheim teilen sich eine Tabelle mit Weichen je art, der Partner-Bereich hat eine eigene.
export default function AreaRoutes({ family, onFamilyChange, onInvite }) {
  if (family.art === 'partner') return <PartnerAreaRoutes family={family} onFamilyChange={onFamilyChange} />

  const partnerArea = isPartnerArea(family)
  return (
    <Routes>
      <Route path="/stammbaum" element={<OverviewPage family={family} onFamilyChange={onFamilyChange} onInvite={onInvite} />} />
      <Route path="/tier/:id" element={<DogDetailPage family={family} onFamilyChange={onFamilyChange} />} />
      <Route path="/hund/:id" element={<RedirectTierUrl />} />
      <Route
        path="/wegbegleiter"
        element={family.art === 'zuhause' ? <CompanionsPage family={family} /> : <ToStart family={family} />}
      />
      <Route path="/tiere" element={family.art === 'tierheim' ? <ShelterAnimalsPage family={family} /> : <ToStart family={family} />} />
      <Route path="/pinnwand" element={<PinboardPage />} />
      <Route path="/wuerfe" element={<LittersPage />} />
      <Route path="/zuchtbuch" element={<Navigate to="/wuerfe" replace />} />
      <Route path="/admin-schreiben" element={<ContactAdminPage />} />
      <Route path="/collage" element={<CollagePage family={family} />} />
      <Route path="/umgebung" element={<NearbyPage />} />
      <Route path="/entdecken" element={family.art === 'tierheim' ? <ToStart family={family} /> : <DiscoverPage />} />
      {/* Profil/Zugang (Phase P) auch für Tierheime - die sind ebenfalls Partner-Bereiche. */}
      <Route path="/profil" element={partnerArea ? <PartnerProfilePage family={family} /> : <ToStart family={family} />} />
      <Route
        path="/zugang"
        element={partnerArea ? <AccessPage family={family} onFamilyChange={onFamilyChange} /> : <ToStart family={family} />}
      />
      <Route path="*" element={<ToStart family={family} />} />
    </Routes>
  )
}
