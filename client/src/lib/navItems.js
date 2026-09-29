// Hauptnavigation je Bereichsart (family.art) - AppHeader rendert sie, am Handy als untere Leiste.

// Mehr als fünf Einträge passen am Handy (375 px) nicht mehr in die untere Leiste - bei genau so vielen
// schaltet App.jsx die Leiste auf die kompakte Variante (layout.css .app-nav-dense).
export const MAX_NAV_ITEMS = 5

// Ab so vielen ungelesenen Nachrichten zeigt das Badge nur noch "99+" (die Leiste bleibt schmal).
const MAX_BADGE_COUNT = 99

// Reiter "Entdecken" (Phase 3) für Haushalte und Rudel, jeweils vor der Collage.
const NAV_ITEM_DISCOVER = { to: '/entdecken', icon: 'compass', label: 'Entdecken' }

// Öffentlicher Auftritt eines Partners (Tierheim oder Partner-Bereich), Phase P.
const NAV_ITEM_PROFILE = { to: '/profil', icon: 'globe', label: 'Profil' }

// Phase P2: eigene Beiträge (Anzeigen mit Freigabe) und das Postfach für "Schreib uns".
const NAV_ITEM_POSTS = { to: '/beitraege', icon: 'megaphone', label: 'Beiträge' }
const NAV_ITEM_INBOX = { to: '/nachrichten', icon: 'inbox', label: 'Nachrichten' }

// Haushalte ("Meine Chronik") sehen den Wegbegleiter statt der Würfe – Rudel weiterhin wie bisher.
const NAV_ITEMS_HOME = [
  { to: '/wegbegleiter', icon: 'route', label: 'Wegbegleiter' },
  { to: '/stammbaum', icon: 'tree', label: 'Stammbaum' },
  { to: '/pinnwand', icon: 'pin', label: 'Pinnwand' },
  NAV_ITEM_DISCOVER,
  { to: '/collage', icon: 'collage', label: 'Collage' }
]

const NAV_ITEMS_GROUP = [
  { to: '/stammbaum', icon: 'tree', label: 'Stammbaum' },
  { to: '/pinnwand', icon: 'pin', label: 'Pinnwand' },
  { to: '/wuerfe', icon: 'sprout', label: 'Würfe' },
  NAV_ITEM_DISCOVER,
  { to: '/collage', icon: 'collage', label: 'Collage' }
]

// Tierheime (Phase T): kein Stammbaum/Würfe, sondern "Unsere Tiere" als Startseite - Pinnwand und
// Collage bleiben unverändert nutzbar, dazu (Phase P) das eigene Profil und (P2) die Nachrichten. Kein
// "Entdecken". Die Beiträge stehen hier als dritter Reiter im Profil, damit es bei fünf Einträgen bleibt.
const NAV_ITEMS_SHELTER = [
  { to: '/tiere', icon: 'paw', label: 'Tiere' },
  { to: '/pinnwand', icon: 'pin', label: 'Pinnwand' },
  { to: '/collage', icon: 'collage', label: 'Collage' },
  NAV_ITEM_PROFILE,
  NAV_ITEM_INBOX
]

// Partner-Bereich (Hundeschule, Hundesalon, Betreuung, …, Phase P): keine Tiere, keine Chronik - das
// eigene Profil, Beiträge und Nachrichten (P2) und der Zugang (Schlüssel, Benutzer).
const NAV_ITEMS_PARTNER = [NAV_ITEM_PROFILE, NAV_ITEM_POSTS, NAV_ITEM_INBOX, { to: '/zugang', icon: 'lock', label: 'Zugang' }]

const NAV_ITEMS_BY_ART = {
  zuhause: NAV_ITEMS_HOME,
  tierheim: NAV_ITEMS_SHELTER,
  partner: NAV_ITEMS_PARTNER
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

// Rudel und klassische Rudel-Logins (ohne art) bekommen die Rudel-Navigation.
export function navItemsFor(family) {
  const items = NAV_ITEMS_BY_ART[family?.art] || NAV_ITEMS_GROUP
  return items.map((item) => withInboxBadge(item, family))
}

// Neue family mit geänderter Zahl ungelesener Nachrichten (PartnerInboxPage nach Lesen/Löschen) - für
// setFamily(current => withUnread(current, n)) in App.jsx. Gleiche Zahl oder kein Partner: dasselbe
// Objekt zurück, damit React nicht neu rendert.
export function withUnread(family, unread) {
  if (!family?.partner || family.partner.unread === unread) return family
  return { ...family, partner: { ...family.partner, unread } }
}
