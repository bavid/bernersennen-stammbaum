// Reiter im Admin (Phase U, AdminPage): statt eines langen Stapels von Karten eine Reiter-Leiste (TabBar). Der
// gewählte Reiter steht in der Adresse (/admin?tab=anfragen), "Übersicht" ohne Parameter.
export const OVERVIEW_TAB = 'uebersicht'
export const TAB_PARAM = 'tab'

export const ADMIN_TABS = [
  { key: OVERVIEW_TAB, label: 'Übersicht' },
  { key: 'anfragen', label: 'Anfragen' },
  { key: 'freigaben', label: 'Freigaben' },
  { key: 'gutscheine', label: 'Gutscheine' },
  { key: 'partner', label: 'Partner' },
  { key: 'empfehlungen', label: 'Empfehlungen & Spenden' },
  { key: 'familien', label: 'Familien' },
  { key: 'nachrichten', label: 'Nachrichten' },
  // Phase N Task 5: globale Hinweise (Band oben auf allen Seiten) - neben den Einstellungen, als eigener Reiter.
  { key: 'hinweise', label: 'Hinweise' },
  { key: 'einstellungen', label: 'Einstellungen' },
  { key: 'protokoll', label: 'Protokoll' }
]

const TAB_KEYS = ADMIN_TABS.map((tab) => tab.key)

// Unbekannte oder fehlende Werte in der Adresse landen bei "Übersicht".
export function adminTabFromParam(value) {
  return TAB_KEYS.includes(value) ? value : OVERVIEW_TAB
}

// Zähler an den Reitern: nur, wo etwas offen ist (0 bleibt ohne Zahl - ruhiger).
export function adminTabCounts({ openRequests, pendingPosts, openMessages }) {
  const counts = {}
  if (openRequests > 0) counts.anfragen = openRequests
  if (pendingPosts > 0) counts.freigaben = pendingPosts
  if (openMessages > 0) counts.nachrichten = openMessages
  return counts
}

// Vorgelesen am Zähler: "(2 offen)".
export function openCountText(count) {
  return `${count} offen`
}

export function adminPanelId(key) {
  return `admin-panel-${key}`
}
