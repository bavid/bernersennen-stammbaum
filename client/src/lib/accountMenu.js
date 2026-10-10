// Phase W (Ruhige Hülle): Einträge des Konto-Menüs (components/AccountMenu.jsx - am Desktop oben rechts, am Handy als
// Blatt hinter "Menü"). Alles, was nicht zu einem Bereich gehört, an einer Stelle: Einstellungen, Einladen, Fotocollage,
// Hilfe & Kontakt, Abmelden, dazu klein Impressum und Datenschutz. Einstellungen und Fotocollage gehören dem eigenen
// Zuhause - von einer Familie oder einem Besuch aus wechselt das AreaGate beim Öffnen von selbst dorthin.
import { areaContext, isHouseholdIdentity } from './areas.js'
import { hasRole } from './roles.js'
import { shortAreaName } from './familyGroups.js'

export const LEGAL_LINKS = [
  { key: 'impressum', label: 'Impressum', to: '/impressum' },
  { key: 'datenschutz', label: 'Datenschutz', to: '/datenschutz' }
]

// Einladen (Phase W, Schritt 2): für einen Haushalt immer das Einladen des eigenen Zuhauses (Besuch, Zuhause verschenken) -
// aus einer Familie oder einem Besuch heraus wechselt App.jsx dafür nach Hause. Beim klassischen Familien-Login lädt man
// Mitglieder ein, erst ab Stellvertretung (Phase R; der Server prüft es ebenso).
export function canInvite(family) {
  if (!family) return false
  if (isHouseholdIdentity(family)) return true
  return family.art !== 'rudel' || hasRole(family, 'stellvertretung')
}

// { key, label, icon, to } für Links, { key, label, icon, action: 'invite' | 'logout' } für Knöpfe. Beim klassischen
// Familien-Login (kein Zuhause dahinter) stehen hier auch "Mitglieder" - dort gibt es keine Gruppenseite.
// Instanz-Modus „rudel“ (me.instanzModus, server/lib/instanzModus.js): kein Einladen (Gutscheine gibt es dort nicht) und
// „Feedback“ statt „Hilfe & Kontakt“ - so heißt der Weg im Hinweis zum Umzug.
export function accountMenuItems(family) {
  const rudelInstanz = family?.instanzModus === 'rudel'
  return [
    { key: 'einstellungen', label: 'Einstellungen', icon: 'settings', to: '/einstellungen' },
    !rudelInstanz && canInvite(family) && { key: 'einladen', label: 'Einladen', icon: 'send', action: 'invite' },
    { key: 'collage', label: 'Fotocollage', icon: 'collage', to: '/collage' },
    // Digitaler Bilderrahmen: die Fotos eurer Tiere als Diashow (spielt wie die Fotocollage im eigenen Zuhause).
    { key: 'bilderrahmen', label: 'Bilderrahmen', icon: 'frame', to: '/bilderrahmen' },
    areaContext(family) === 'classic' && { key: 'mitglieder', label: 'Mitglieder', icon: 'users', to: '/mitglieder' },
    { key: 'hilfe', label: rudelInstanz ? 'Feedback' : 'Hilfe & Kontakt', icon: 'message', to: '/admin-schreiben' },
    { key: 'abmelden', label: 'Abmelden', icon: 'logout', action: 'logout' }
  ].filter(Boolean)
}

// Name am Menü: das eigene Zuhause (auch aus einer Familie oder zu Besuch heraus), beim klassischen Login die Familie.
export function accountName(family) {
  return family?.home?.name || family?.name || ''
}

// Bild am Menü (server/lib/profil.js): das des eigenen Zuhauses, beim klassischen Login (home = die Familie) das der Familie.
export function accountBild(family) {
  return family?.home?.bild || family?.bild || null
}

// Anfangsbuchstabe für den runden Platzhalter: "Zuhause Lindenhof (Demo)" -> "L".
export function accountInitial(name) {
  const short = shortAreaName(name || '')
  return (short.match(/\p{L}|\p{N}/u)?.[0] || '?').toUpperCase()
}
