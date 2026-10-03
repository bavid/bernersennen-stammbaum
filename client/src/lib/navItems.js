import { getTheme } from '../themes/index.js'

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

// Phase U: Stammbaum und Würfe heißen je Auftritt anders (Theme-Wörter treeLabel/littersLabel - Standard
// "Familienbande"/"Nachwuchs", Berner "Stammbaum"/"Würfe"); labelKey statt label, navItemsFor setzt das Wort ein.
const NAV_ITEM_TREE = { to: '/stammbaum', icon: 'tree', labelKey: 'treeLabel' }
const NAV_ITEM_LITTERS = { to: '/wuerfe', icon: 'sprout', labelKey: 'littersLabel' }

// Haushalte ("Meine Chronik") sehen den Wegbegleiter statt der Würfe – Rudel weiterhin wie bisher.
// Phase V2: dort stehen auch die offenen "Erlebt mit"-Anfragen - der Eintrag bekommt dafür ein Badge (withRequestBadge).
const NAV_ITEM_COMPANIONS = { to: '/wegbegleiter', icon: 'route', label: 'Wegbegleiter' }
const NAV_ITEMS_HOME = [
  NAV_ITEM_COMPANIONS,
  NAV_ITEM_TREE,
  { to: '/pinnwand', icon: 'pin', label: 'Pinnwand' },
  NAV_ITEM_DISCOVER,
  { to: '/collage', icon: 'collage', label: 'Collage' }
]

// Würfe bzw. Nachwuchs nur, wo der Auftritt sie in der Leiste führt (theme.littersInNav, Berner) - im Standard-
// Auftritt stehen sie als Abschnitt auf der Familienbande (OffspringSection), /wuerfe bleibt erreichbar.
const NAV_ITEMS_GROUP = [
  NAV_ITEM_TREE,
  { to: '/pinnwand', icon: 'pin', label: 'Pinnwand' },
  NAV_ITEM_LITTERS,
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

// Zu Besuch in einem anderen Zuhause (Phase V2, me.zuBesuch): nur ansehen - dessen Wegbegleiter und Stammbaum.
// Pinnwand, Entdecken und Collage gehören nicht zu einem Besuch (der Server sperrt sie für Gäste ohnehin).
const NAV_ITEMS_VISIT = [{ to: '/wegbegleiter', icon: 'route', label: 'Wegbegleiter' }, NAV_ITEM_TREE]

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

// Hinweise für das eigene Zuhause als Badge an "Wegbegleiter" (dort stehen sie): offene "Erlebt mit"-Anfragen
// (me.erlebtMitOffen, Phase V2) und neue Gäste, die noch niemand mit „Passt“ bestätigt hat (me.neueGaeste,
// security-review V2 M-3).
const countOf = (value) => (Number.isInteger(value) && value > 0 ? value : 0)

function withRequestBadge(item, family) {
  const offen = countOf(family?.erlebtMitOffen)
  const gaeste = countOf(family?.neueGaeste)
  const total = offen + gaeste
  if (item !== NAV_ITEM_COMPANIONS || total === 0 || family?.zuBesuch) return item
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

// Rudel und klassische Rudel-Logins (ohne art) bekommen die Rudel-Navigation. theme: der angezeigte Auftritt
// (AppHeader: useTheme().theme, samt Vorschau in den Einstellungen) - ohne Angabe der gespeicherte der Familie.
export function navItemsFor(family, theme = getTheme(family?.theme)) {
  const items = family?.zuBesuch ? NAV_ITEMS_VISIT : NAV_ITEMS_BY_ART[family?.art] || NAV_ITEMS_GROUP
  return items
    .filter((item) => item !== NAV_ITEM_LITTERS || theme.littersInNav)
    .map((item) => withRequestBadge(withInboxBadge(withThemeLabel(item, theme.words), family), family))
}

// Neue family mit geänderter Zahl ungelesener Nachrichten (PartnerInboxPage nach Lesen/Löschen) - für
// setFamily(current => withUnread(current, n)) in App.jsx. Gleiche Zahl oder kein Partner: dasselbe
// Objekt zurück, damit React nicht neu rendert.
export function withUnread(family, unread) {
  if (!family?.partner || family.partner.unread === unread) return family
  return { ...family, partner: { ...family.partner, unread } }
}
