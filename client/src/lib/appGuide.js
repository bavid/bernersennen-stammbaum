// Anleitung „Als App aufs Handy“ (pages/AppPage.jsx, /app): je Gerät die Schritte in Worten - mit kleinen Symbolen aus
// components/Icon.jsx statt Bildschirmfotos fremder Oberflächen. Ehrlich: ohne App Store, über den Browser; die Stores
// sind eine spätere Option (STORES_LINE, auch in components/InstallHint.jsx).
export const PLATFORMS = Object.freeze([
  { key: 'android', label: 'Android' },
  { key: 'ios', label: 'iPhone & iPad' },
  { key: 'desktop', label: 'PC & Laptop' }
])

export const STORES_LINE = 'Später auch in den App Stores – heute schon als App über den Browser.'

export const GUIDES = Object.freeze({
  android: Object.freeze({
    title: 'Android (Chrome)',
    steps: Object.freeze([
      { icon: 'download', text: 'Zeigt Chrome unten „Installieren“ oder oben den Knopf „App installieren“, genügt ein Tippen.' },
      { icon: 'more', text: 'Sonst: Menü ⋮ oben rechts → „App installieren“ (ältere Versionen: „Zum Startbildschirm hinzufügen“).' },
      { icon: 'check', text: 'Danach liegt „Pfoten“ auf dem Startbildschirm – mit eigenem Fenster, ohne Adressleiste.' }
    ]),
    notes: Object.freeze(['Andere Browser (Firefox, Samsung Internet): ebenfalls im Menü, „Zum Startbildschirm hinzufügen“.'])
  }),
  ios: Object.freeze({
    title: 'iPhone & iPad (Safari)',
    steps: Object.freeze([
      { icon: 'share', text: 'Unten in Safari das Teilen-Symbol antippen – das Quadrat mit dem Pfeil nach oben.' },
      {
        icon: 'download',
        text: 'In der Liste ggf. nach unten scrollen: auf neueren iOS-Versionen liegt „Zum Home-Bildschirm“ am Ende der Liste oder unter „Mehr“.'
      },
      { icon: 'plus', text: '„Zum Home-Bildschirm“ antippen und oben rechts mit „Hinzufügen“ bestätigen.' }
    ]),
    notes: Object.freeze([
      'Chrome oder Firefox auf dem iPhone: dort ebenfalls über das Teilen-Symbol.',
      'Fehlt das Symbol (z. B. in der Vorschau einer anderen App): die Seite in Safari öffnen.'
    ])
  }),
  desktop: Object.freeze({
    title: 'PC & Laptop (Chrome, Edge)',
    steps: Object.freeze([
      { icon: 'download', text: 'Rechts in der Adressleiste erscheint ein Symbol „Installieren“ – anklicken.' },
      { icon: 'check', text: 'Bestätigen – die Chronik öffnet sich in einem eigenen Fenster und steht im Startmenü.' }
    ]),
    notes: Object.freeze(['Firefox am PC kennt das Installieren nicht – dort einfach ein Lesezeichen setzen.'])
  })
})

export function isPlatform(key) {
  return PLATFORMS.some((platform) => platform.key === key)
}

export function guideFor(platform) {
  return GUIDES[isPlatform(platform) ? platform : 'desktop']
}
