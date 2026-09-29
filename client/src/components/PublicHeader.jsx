import { Link, useLocation, useNavigate } from 'react-router-dom'
import Icon from './Icon.jsx'
import ThemeMark from './ThemeMark.jsx'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { startRoute } from '../lib/areas.js'

// Gibt es in diesem Tab einen Schritt zurück innerhalb der App? BrowserRouter legt die Position im Verlauf als
// history.state.idx ab (0 = der erste Aufruf in diesem Tab, z. B. ein Link von außen oder ein Lesezeichen). Ohne
// diesen Wert (MemoryRouter in Tests) zählt der Schlüssel der Adresse: nur der Einstieg heißt 'default'.
export function canGoBack(location) {
  const idx = window.history.state?.idx
  if (typeof idx === 'number') return idx > 0
  return Boolean(location?.key) && location.key !== 'default'
}

// Ziel von "Zurück", wenn es keinen Schritt zurück gibt: angemeldet die Startseite des Bereichs, sonst die
// Login-Seite.
export function backFallback(family) {
  return family ? startRoute(family) : '/'
}

// Schlanker Kopf der öffentlichen Seiten (Impressum, Datenschutz, Partnerliste, Partner werden, Portal,
// Steckbrief): Logo und Name führen zur Startseite, "Zurück" geht einen Schritt im Verlauf zurück - oder, wenn
// man direkt hier eingestiegen ist, zur Startseite (angemeldet die des Bereichs). family: die laufende
// Sitzung (me) oder null.
export default function PublicHeader({ family = null }) {
  const { theme } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()

  function handleBack() {
    if (canGoBack(location)) navigate(-1)
    else navigate(backFallback(family))
  }

  return (
    <header className="public-header">
      <Link to="/" className="public-header-brand">
        <ThemeMark size={32} />
        <span>{theme.appName}</span>
      </Link>
      <button type="button" className="btn btn-ghost public-header-back" onClick={handleBack}>
        <Icon name="arrowLeft" />
        Zurück
      </button>
    </header>
  )
}
