// Phase W (Ruhige Hülle): Einträge des Konto-Menüs (components/AccountMenu.jsx - am Desktop oben rechts, am Handy als
// Blatt hinter "Menü"). Alles, was nicht zu einem Bereich gehört, an einer Stelle: Einstellungen, Einladen, Fotocollage,
// Hilfe & Kontakt, Abmelden, dazu klein Impressum und Datenschutz. Einstellungen und Fotocollage gehören dem eigenen
// Zuhause - von einer Familie oder einem Besuch aus wechselt das AreaGate beim Öffnen von selbst dorthin.
import { areaContext } from './areas.js'
import { hasRole } from './roles.js'
import { shortAreaName } from './familyGroups.js'

export const LEGAL_LINKS = [
  { key: 'impressum', label: 'Impressum', to: '/impressum' },
  { key: 'datenschutz', label: 'Datenschutz', to: '/datenschutz' }
]

// Einladen: nicht zu Besuch (der Server sperrt es dort), in einer Familie erst ab Stellvertretung (Phase R) - wie bisher
// der Knopf im Fuß der App.
export function canInvite(family) {
  if (!family || family.zuBesuch) return false
  return family.art !== 'rudel' || hasRole(family, 'stellvertretung')
}

// { key, label, icon, to } für Links, { key, label, icon, action: 'invite' | 'logout' } für Knöpfe. Beim klassischen
// Familien-Login (kein Zuhause dahinter) stehen hier auch "Mitglieder" - dort gibt es keine Gruppenseite.
export function accountMenuItems(family) {
  return [
    { key: 'einstellungen', label: 'Einstellungen', icon: 'settings', to: '/einstellungen' },
    canInvite(family) && { key: 'einladen', label: 'Einladen', icon: 'send', action: 'invite' },
    { key: 'collage', label: 'Fotocollage', icon: 'collage', to: '/collage' },
    areaContext(family) === 'classic' && { key: 'mitglieder', label: 'Mitglieder', icon: 'users', to: '/mitglieder' },
    { key: 'hilfe', label: 'Hilfe & Kontakt', icon: 'message', to: '/admin-schreiben' },
    { key: 'abmelden', label: 'Abmelden', icon: 'logout', action: 'logout' }
  ].filter(Boolean)
}

// Name am Menü: das eigene Zuhause (auch aus einer Familie oder zu Besuch heraus), beim klassischen Login die Familie.
export function accountName(family) {
  return family?.home?.name || family?.name || ''
}

// Anfangsbuchstabe für den runden Platzhalter: "Zuhause Lindenhof (Demo)" -> "L".
export function accountInitial(name) {
  const short = shortAreaName(name || '')
  return (short.match(/\p{L}|\p{N}/u)?.[0] || '?').toUpperCase()
}
