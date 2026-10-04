import { isOwnHome } from '../lib/visits.js'
import CodeInvite from './invite/CodeInvite.jsx'
import HomeInvite from './invite/HomeInvite.jsx'

export { PRINTED_HINT } from './invite/CodeList.jsx'

// Einladen (Phase W, Schritt 2 getrennt nach Zweck): im eigenen Zuhause die zwei Wege „Zu Besuch einladen“ und „Zuhause
// verschenken“ (invite/HomeInvite.jsx - das Konto-Menü öffnet den Dialog immer dort, App.jsx), in einer Familie nur
// „Mitglied einladen“ (Einladungscodes mit Rolle), bei Partnern und Tierheimen „Einladungscode weitergeben“
// (invite/CodeInvite.jsx). Ob jemand einladen darf, prüft der Server (routes/vouchers.js, routes/besuche.js).
export default function InviteDialog({ family }) {
  if (isOwnHome(family)) return <HomeInvite />
  return <CodeInvite family={family} />
}
