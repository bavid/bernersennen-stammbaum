// Zuhause besuchen (Phase V2, server/routes/besuche.js): Hilfen für Einladungen, Bereichswechsler und Gast-Ansicht.
import { t } from './i18n/index.js'

// Öffentlicher Einlöse-Link für einen Code (wie der Gutschein-Link: /v#CODE ohne Bindestriche, nie als Query).
export function voucherLink(code) {
  return `${window.location.origin}/v#${String(code || '').replace(/-/g, '')}`
}

// "Zu Besuch bei Zuhause am Deich"
export function visitLabel(name) {
  return t('Zu Besuch bei {name}', { name })
}

// Ist die Sitzung gerade zu Besuch in einem anderen Zuhause (me.zuBesuch vom Server)? Dann nur ansehen und
// kommentieren - keine Bearbeiten-, Einladen- oder Teilen-Knöpfe.
export function isVisit(family) {
  return Boolean(family?.zuBesuch)
}

// Darf der Haushalt von hier aus einladen bzw. einen Code einlösen? Nur im eigenen Zuhause, nicht in einer Familie
// und nicht während eines Besuchs.
export function isOwnHome(family) {
  return Boolean(family?.home && family.art === 'zuhause' && family.home.id === family.id && !family.zuBesuch)
}
