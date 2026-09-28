// Hauptnavigation je Bereichsart (family.art) - AppHeader rendert sie, am Handy als untere Leiste.

// Mehr als fünf Einträge passen am Handy (375 px) nicht mehr in die untere Leiste - bei genau so vielen
// schaltet App.jsx die Leiste auf die kompakte Variante (layout.css .app-nav-dense).
export const MAX_NAV_ITEMS = 5

// Reiter "Entdecken" (Phase 3) für Haushalte und Rudel, jeweils vor der Collage.
const NAV_ITEM_DISCOVER = { to: '/entdecken', icon: 'compass', label: 'Entdecken' }

// Öffentlicher Auftritt eines Partners (Tierheim oder Partner-Bereich), Phase P.
const NAV_ITEM_PROFILE = { to: '/profil', icon: 'globe', label: 'Profil' }

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
// Collage bleiben unverändert nutzbar, dazu (Phase P) das eigene Profil. Kein "Entdecken".
const NAV_ITEMS_SHELTER = [
  { to: '/tiere', icon: 'paw', label: 'Tiere' },
  { to: '/pinnwand', icon: 'pin', label: 'Pinnwand' },
  { to: '/collage', icon: 'collage', label: 'Collage' },
  NAV_ITEM_PROFILE
]

// Partner-Bereich (Hundeschule, Hundesalon, Betreuung, …, Phase P): keine Tiere, keine Chronik - nur
// das eigene Profil und der Zugang (Schlüssel, Benutzer).
const NAV_ITEMS_PARTNER = [NAV_ITEM_PROFILE, { to: '/zugang', icon: 'lock', label: 'Zugang' }]

const NAV_ITEMS_BY_ART = {
  zuhause: NAV_ITEMS_HOME,
  tierheim: NAV_ITEMS_SHELTER,
  partner: NAV_ITEMS_PARTNER
}

// Rudel und klassische Rudel-Logins (ohne art) bekommen die Rudel-Navigation.
export function navItemsFor(family) {
  return NAV_ITEMS_BY_ART[family?.art] || NAV_ITEMS_GROUP
}
