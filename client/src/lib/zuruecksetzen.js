import { KONTAKT_KEY } from './kontaktDefaults.js'
import { removeSetting } from './storage.js'
import { tOr } from './i18n/index.js'

// „Unsere Einstellungen zurücksetzen“ (Einstellungen › App, components/settings/app/EinstellungenZuruecksetzen.jsx).
// Ehrlich: eine Website kann die Berechtigungen des Browsers nicht selbst zurücknehmen. Der Knopf löscht, was WIR auf
// diesem Gerät gespeichert haben (dazu das Push-Abo im Browser und auf dem Server) und zeigt, wo die Berechtigungen
// selbst sitzen - je Gerät.
export const UNSERE_EINSTELLUNGEN = Object.freeze(['nearbyPlz', 'nearbyRadius', 'standortGemerkt', 'installHintDismissedAt', KONTAKT_KEY])

export function forgetOurSettings() {
  for (const key of UNSERE_EINSTELLUNGEN) removeSetting(key)
}

const ANLEITUNG = Object.freeze({
  android: Object.freeze([
    'Chrome: das Symbol links in der Adressleiste (Seiteninfo) antippen → „Berechtigungen“ → „Berechtigungen zurücksetzen“.',
    'Als installierte App: Android-Einstellungen → Apps → „Pfoten“ → Berechtigungen (Benachrichtigungen, Standort).'
  ]),
  ios: Object.freeze([
    'Safari: iOS-Einstellungen → Apps → Safari → „Standort“ bzw. „Erweitert“ → „Website-Daten“ (Eintrag dieser Seite entfernen).',
    'Als App auf dem Home-Bildschirm: iOS-Einstellungen → Mitteilungen → „Pfoten“ bzw. Datenschutz & Sicherheit → Ortungsdienste.'
  ]),
  desktop: Object.freeze([
    'Chrome/Edge: das Symbol links in der Adressleiste anklicken → „Website-Einstellungen“ → „Berechtigungen zurücksetzen“.',
    'Firefox: das Schloss in der Adressleiste → „Verbindung sicher“ → „Weitere Informationen“ → Reiter „Berechtigungen“.'
  ])
})

export function anleitungFuer(platform) {
  const key = ANLEITUNG[platform] ? platform : 'desktop'
  return tOr(`settings.reset.guide.${key}`, ANLEITUNG[key])
}
