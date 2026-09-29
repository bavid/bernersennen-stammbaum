import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import { useTheme } from '../themes/ThemeProvider.jsx'

// Band über jeder Seite einer Demo-Sitzung (App.jsx). Haushalte und Rudel: "Eigene Familie anlegen"
// (onLeave meldet ab und führt zum Einlösen). Partner- und Tierheim-Demos (Phase P2, partnerArea): ein
// Gutschein für ein Zuhause hilft einem Partner nicht - der Knopf führt zu den Kontaktdaten im Impressum
// ("Schreib dem Admin" nimmt aus einer Demo-Sitzung keine Nachrichten an).
export default function DemoBanner({ onLeave, partnerArea = false }) {
  const { words } = useTheme()
  return (
    <div className="demo-banner" role="status">
      <Icon name="alert" />
      <span>Du siehst eine schreibgeschützte Demo – nichts wird gespeichert oder hochgeladen.</span>
      {partnerArea ? (
        <Link to="/impressum" className="btn btn-primary">
          Eigenes Partner-Profil? Kontakt im Impressum
        </Link>
      ) : (
        <button type="button" className="btn btn-primary" onClick={onLeave}>
          {words.createOwnGroup}
        </button>
      )}
    </div>
  )
}
