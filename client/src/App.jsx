import { useEffect, useState, createContext, useContext } from 'react'
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import { api } from './api'
import LoginPage from './pages/LoginPage.jsx'
import CreateFamilyPage from './pages/CreateFamilyPage.jsx'
import OverviewPage from './pages/OverviewPage.jsx'
import DogDetailPage from './pages/DogDetailPage.jsx'
import BreedingFormPage from './pages/BreedingFormPage.jsx'
import CollagePage from './pages/CollagePage.jsx'

const FamilyContext = createContext(null)

export function useFamily() {
  return useContext(FamilyContext)
}

function RequireFamily({ family, children }) {
  const location = useLocation()
  if (family === undefined) return null
  if (!family) return <Navigate to="/" state={{ from: location }} replace />
  return children
}

export default function App() {
  const [family, setFamily] = useState(undefined)

  useEffect(() => {
    api
      .me()
      .then(setFamily)
      .catch(() => setFamily(null))
  }, [])

  async function handleLogout() {
    await api.logout()
    setFamily(null)
  }

  return (
    <FamilyContext.Provider value={family}>
      <div className="app-shell">
        <header className="app-header">
          <Link to={family ? '/stammbaum' : '/'} className="brand">
            <span className="brand-mark">🐾</span> Familienchronik
          </Link>
          {family && (
            <nav className="app-nav">
              <span className="pill pill-rust">{family.name}</span>
              <Link to="/stammbaum">Stammbaum</Link>
              <Link to="/deckakt-erfassen">Deckakt erfassen</Link>
              <Link to="/collage">Collage</Link>
              <button className="btn btn-ghost" onClick={handleLogout}>
                Abmelden
              </button>
            </nav>
          )}
        </header>

        <main className="app-main">
          <Routes>
            <Route path="/" element={<LoginPage family={family} onLogin={setFamily} />} />
            <Route path="/neue-familie" element={<CreateFamilyPage onCreated={setFamily} />} />
            <Route
              path="/stammbaum"
              element={
                <RequireFamily family={family}>
                  <OverviewPage />
                </RequireFamily>
              }
            />
            <Route
              path="/hund/:id"
              element={
                <RequireFamily family={family}>
                  <DogDetailPage />
                </RequireFamily>
              }
            />
            <Route
              path="/deckakt-erfassen"
              element={
                <RequireFamily family={family}>
                  <BreedingFormPage />
                </RequireFamily>
              }
            />
            <Route
              path="/collage"
              element={
                <RequireFamily family={family}>
                  <CollagePage />
                </RequireFamily>
              }
            />
          </Routes>
        </main>
      </div>
    </FamilyContext.Provider>
  )
}
