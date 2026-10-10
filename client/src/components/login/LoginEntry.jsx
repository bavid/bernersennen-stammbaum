import LoginPage from '../../pages/LoginPage.jsx'
import RudelLoginPage from '../../pages/RudelLoginPage.jsx'
import RouteFallback from '../RouteFallback.jsx'
import useInstanzModus from '../../hooks/useInstanzModus.js'
import { isRudelInstanz } from '../../lib/instanzModus.js'

// Die Anmeldeseite je Instanz: im Rudel-Modus nur der ruhige Passwort-Login (RudelLoginPage), sonst die volle Startseite.
// Bis GET /api/config antwortet, ein kurzer Platzhalter - die Rudel-Instanz soll nie kurz Gutschein oder Demo zeigen.
export default function LoginEntry(props) {
  const modus = useInstanzModus()
  if (modus === null) return <RouteFallback />
  return isRudelInstanz(modus) ? <RudelLoginPage onLogin={props.onLogin} /> : <LoginPage {...props} />
}
