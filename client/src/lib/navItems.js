import { getTheme } from '../themes/index.js'
import { isHouseholdIdentity } from './areas.js'

// Hauptnavigation je Bereichsart (family.art) - AppHeader rendert sie, am Handy als untere Leiste.

// Mehr als fünf Einträge passen am Handy (375 px) nicht mehr in die untere Leiste - bei genau so vielen
// schaltet App.jsx die Leiste auf die kompakte Variante (layout.css .app-nav-dense).
export const MAX_NAV_ITEMS = 5

// Ab so vielen ungelesenen Nachrichten zeigt das Badge nur noch "99+" (die Leiste bleibt schmal).
const MAX_BADGE_COUNT = 99

// Reiter "Entdecken" (Phase 3) für Haushalte und Familien.
const NAV_ITEM_DISCOVER = { to: '/entdecken', icon: 'compass', label: 'Entdecken' }

// Öffentlicher Auftritt eines Partners (Tierheim oder Partner-Bereich), Phase P.
const NAV_ITEM_PROFILE = { to: '/profil', icon: 'globe', label: 'Profil' }

// Phase P2: eigene Beiträge (Anzeigen mit Freigabe) und das Postfach für "Schreib uns".
const NAV_ITEM_POSTS = { to: '/beitraege', icon: 'megaphone', label: 'Beiträge' }
const NAV_ITEM_INBOX = { to: '/nachrichten', icon: 'inbox', label: 'Nachrichten' }
// Phase V4a: der Kalender der Partner (Termine und Serien).
const NAV_ITEM_CALENDAR = { to: '/kalender', icon: 'calendar', label: 'Kalender' }
const NAV_ITEM_PINBOARD = { to: '/pinnwand', icon: 'pin', label: 'Pinnwand' }

// Phase W (Ruhige Hülle): vier feste Punkte in jedem Kontext eines Haushalts - Start (Neuigkeiten, "Für dich"), Tiere
// (Raster mit Reitern Zeitleiste/Stammbaum), Familien (Gruppenseiten, befreundete Zuhause) und Entdecken. "Tiere" und
// "Familien" heißen je Auftritt anders (Theme-Wörter animals/groups - Berner "Hunde"/"Rudel"); labelKey statt label,
// navItemsFor setzt das Wort ein. Am Handy kommt "Menü" als fünfter Platz dazu (App.jsx, hasMenuSlot).
// Phase V2/W: Start trägt das Badge für offene "Mit dabei"-Anfragen und neue Gäste (withRequestBadge).
const NAV_ITEM_START = { to: '/start', icon: 'home', label: 'Start' }
const NAV_ITEM_ANIMALS = { to: '/tiere', icon: 'paw', labelKey: 'animals' }
const NAV_ITEM_FAMILIES = { to: '/familien', icon: 'users', labelKey: 'groups' }
const NAV_ITEMS_HOUSEHOLD = [NAV_ITEM_START, NAV_ITEM_ANIMALS, NAV_ITEM_FAMILIES, NAV_ITEM_DISCOVER]

// Klassischer Login mit dem gemeinsamen Schlüssel einer Familie (kein Zuhause dahinter): statt "Familien" die Pinnwand
// der Familie. Mitglieder & Rollen stehen im Menü.
const NAV_ITEMS_CLASSIC = [NAV_ITEM_START, NAV_ITEM_ANIMALS, NAV_ITEM_PINBOARD, NAV_ITEM_DISCOVER]

// Tierheime (Phase T): kein Stammbaum/Würfe, sondern "Unsere Tiere" als Startseite - Pinnwand und
// Collage bleiben unverändert nutzbar, dazu (Phase P) das eigene Profil und (P2) die Nachrichten. Kein
// "Entdecken". Die Beiträge und (Phase V4a) der Kalender stehen hier als Reiter im Profil, damit es bei fünf Einträgen bleibt.
const NAV_ITEMS_SHELTER = [
  { to: '/tiere', icon: 'paw', label: 'Tiere' },
  NAV_ITEM_PINBOARD,
  { to: '/collage', icon: 'collage', label: 'Collage' },
  NAV_ITEM_PROFILE,
  NAV_ITEM_INBOX
]

// Partner-Bereich (Hundeschule, Hundesalon, Betreuung, …, Phase P): keine Tiere, keine Chronik - das
// eigene Profil, Beiträge und Nachrichten (P2), der Kalender (V4a) und der Zugang (Schlüssel, Benutzer) - fünf Einträge,
// die Leiste wird am Handy kompakt (MAX_NAV_ITEMS).
const NAV_ITEMS_PARTNER = [NAV_ITEM_PROFILE, NAV_ITEM_POSTS, NAV_ITEM_CALENDAR, NAV_ITEM_INBOX, { to: '/zugang', icon: 'lock', label: 'Zugang' }]

const NAV_ITEMS_BY_ART = {
  tierheim: NAV_ITEMS_SHELTER,
  partner: NAV_ITEMS_PARTNER
}

// Am Handy der fünfte Platz "Menü" (AccountMenu als Blatt von unten): für Haushalte und klassische Familien-Logins -
// Tierheime und Partner behalten ihre fünf Punkte und ihren Kopf.
export function hasMenuSlot(family) {
  return !NAV_ITEMS_BY_ART[family?.art]
}

// Ungelesene Nachrichten (me.partner.unread, Phase P2) - nur eine ganze Zahl > 0 zählt.
export function unreadCount(family) {
  const unread = family?.partner?.unread
  return Number.isInteger(unread) && unread > 0 ? unread : 0
}

// "Nachrichten" bekommt bei ungelesenen Nachrichten ein Badge (badge: "2" bzw. "99+") und einen
// sprechenden Namen für Screenreader (ariaLabel: "Nachrichten, 2 ungelesen") - das Badge selbst ist dann
// aria-hidden. Alle anderen Einträge bleiben, wie sie sind.
function withInboxBadge(item, family) {
  const unread = unreadCount(family)
  if (item !== NAV_ITEM_INBOX || unread === 0) return item
  return {
    ...item,
    badge: unread > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : String(unread),
    ariaLabel: `${item.label}, ${unread} ungelesen`
  }
}

// Hinweise für das eigene Zuhause als Badge an "Start" (dort stehen sie unter "Für dich"): offene "Mit dabei"-Anfragen
// (me.erlebtMitOffen, Phase V2) und neue Gäste, die noch niemand mit „Passt“ bestätigt hat (me.neueGaeste,
// security-review V2 M-3). Phase W: in jedem Kontext - die Zahlen gehören der Identität, Start führt nach Hause.
const countOf = (value) => (Number.isInteger(value) && value > 0 ? value : 0)

function withRequestBadge(item, family) {
  const offen = countOf(family?.erlebtMitOffen)
  const gaeste = countOf(family?.neueGaeste)
  const total = offen + gaeste
  if (item !== NAV_ITEM_START || total === 0) return item
  const parts = [
    offen > 0 ? `${offen} ${offen === 1 ? 'offene Anfrage' : 'offene Anfragen'}` : null,
    gaeste > 0 ? `${gaeste} ${gaeste === 1 ? 'neuer Gast' : 'neue Gäste'}` : null
  ].filter(Boolean)
  return {
    ...item,
    badge: total > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : String(total),
    ariaLabel: `${item.label}, ${parts.join(', ')}`
  }
}

// Beschriftung aus den Theme-Wörtern (labelKey) - labelKey selbst geht nicht mit hinaus.
function withThemeLabel(item, words) {
  if (!item.labelKey) return item
  const { labelKey, ...rest } = item
  return { ...rest, label: words[labelKey] }
}

// theme: der angezeigte Auftritt (AppHeader: useTheme().theme, samt Vorschau in den Einstellungen) - ohne Angabe der
// gespeicherte der Familie.
export function navItemsFor(family, theme = getTheme(family?.theme)) {
  const items = NAV_ITEMS_BY_ART[family?.art] || (isHouseholdIdentity(family) ? NAV_ITEMS_HOUSEHOLD : NAV_ITEMS_CLASSIC)
  return items.map((item) => withRequestBadge(withInboxBadge(withThemeLabel(item, theme.words), family), family))
}

// Neue family mit geänderter Zahl ungelesener Nachrichten (PartnerInboxPage nach Lesen/Löschen) - für
// setFamily(current => withUnread(current, n)) in App.jsx. Gleiche Zahl oder kein Partner: dasselbe
// Objekt zurück, damit React nicht neu rendert.
export function withUnread(family, unread) {
  if (!family?.partner || family.partner.unread === unread) return family
  return { ...family, partner: { ...family.partner, unread } }
}
