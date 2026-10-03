import { useTheme } from '../themes/ThemeProvider.jsx'
import { roleLabel } from '../lib/roles.js'

// Kleiner Chip mit der Rolle im Wortlaut des Aussehens („Rudelführer“ / „Familienleitung“, …): im Kopf
// eines klassischen Familien-Logins als Zusatz zum Namen, bei Einladungen und auf der Mitglieder-Seite
// (der Bereichswechsler nennt die Rolle seit Familienbande 2 als leise zweite Zeile). Ohne bekannte Rolle
// (ältere Antwort, eigener Bereich) erscheint nichts.
export default function RoleBadge({ rolle, className = '' }) {
  const { words } = useTheme()
  const label = roleLabel(words, rolle)
  if (!label) return null
  return <span className={`role-badge role-badge-${rolle} ${className}`.trim()}>{label}</span>
}
