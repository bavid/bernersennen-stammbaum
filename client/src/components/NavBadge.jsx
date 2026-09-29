// Zahl an einem Eintrag der Hauptnavigation (Phase P2: ungelesene Nachrichten an "Nachrichten", siehe
// lib/navItems.js). Nur Optik - den sprechenden Namen ("Nachrichten, 2 ungelesen") trägt der Link selbst
// als aria-label. Ohne badge nichts.
export default function NavBadge({ badge }) {
  if (!badge) return null
  return (
    <span className="app-nav-badge" aria-hidden="true">
      {badge}
    </span>
  )
}
