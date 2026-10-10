// Reiter im Admin (AdminPage): fünf Hauptreiter, jeder mit Unterreitern (zweite TabBar) - ein Thema je Unterreiter
// statt langer Sammelseiten (Plan docs/superpowers/plans/2026-10-10-admin-5-reiter.md). In der Adresse steht
// /admin?tab=<haupt>&bereich=<unter>; „Übersicht“ mit ihrem ersten Unterreiter ganz ohne Parameter.
// Die Unterreiter-Schlüssel sind über alle Hauptreiter eindeutig (Panel-Ids) - die alten Reiter behalten ihren Schlüssel.
export const OVERVIEW_TAB = 'uebersicht'
export const TAB_PARAM = 'tab'
export const SUB_PARAM = 'bereich'

export const ADMIN_SECTIONS = [
  {
    key: OVERVIEW_TAB,
    label: 'Übersicht',
    subs: [
      { key: 'ueberblick', label: 'Auf einen Blick' },
      { key: 'erfolg', label: 'Erfolg messen' }
    ]
  },
  {
    key: 'familien-partner',
    label: 'Familien & Partner',
    subs: [
      { key: 'familien', label: 'Familien' },
      { key: 'partner', label: 'Partner' },
      { key: 'anfragen', label: 'Anfragen' },
      { key: 'gutscheine', label: 'Einladungscodes' },
      { key: 'einladungskarte', label: 'Einladungskarte' }
    ]
  },
  {
    key: 'inhalte',
    label: 'Inhalte & Freigaben',
    subs: [
      { key: 'freigaben', label: 'Freigaben' },
      { key: 'nachrichten', label: 'Nachrichten' },
      { key: 'hinweise', label: 'Hinweise' }
    ]
  },
  {
    key: 'werbung',
    label: 'Werbung & Messen',
    subs: [
      { key: 'empfehlungen', label: 'Empfehlungen' },
      { key: 'band', label: 'Band „Mit dabei“' },
      { key: 'landeadressen', label: 'Landeadressen' },
      { key: 'statistik', label: 'Statistik' },
      { key: 'spenden', label: 'Spenden' },
      { key: 'finanzierung', label: 'Finanzierung' }
    ]
  },
  {
    key: 'system',
    label: 'System',
    subs: [
      { key: 'server', label: 'Server' },
      { key: 'benachrichtigungen', label: 'Benachrichtigungen' },
      { key: 'protokoll', label: 'Protokoll' }
    ]
  }
]

// Die 13 Reiter vor dem Umbau (?tab=<alt>) - alte Lesezeichen und Sprünge („Zu tun“) landen im neuen Paar.
export const LEGACY_TABS = {
  uebersicht: [OVERVIEW_TAB, 'ueberblick'],
  anfragen: ['familien-partner', 'anfragen'],
  freigaben: ['inhalte', 'freigaben'],
  gutscheine: ['familien-partner', 'gutscheine'],
  partner: ['familien-partner', 'partner'],
  empfehlungen: ['werbung', 'empfehlungen'],
  familien: ['familien-partner', 'familien'],
  nachrichten: ['inhalte', 'nachrichten'],
  hinweise: ['inhalte', 'hinweise'],
  finanzierung: ['werbung', 'finanzierung'],
  einstellungen: ['system', 'benachrichtigungen'],
  server: ['system', 'server'],
  protokoll: ['system', 'protokoll']
}

export function adminSection(key) {
  return ADMIN_SECTIONS.find((section) => section.key === key)
}

// Haupt- und Unterreiter zu einem Unterreiter-Schlüssel (z. B. 'nachrichten' → inhalte/nachrichten).
function sectionOfSub(sub) {
  return ADMIN_SECTIONS.find((section) => section.subs.some((item) => item.key === sub))
}

// Aus der Adresse: ein alter Reiter gilt vor `bereich`; ein neuer Hauptreiter nimmt `bereich`, wenn es zu ihm gehört,
// sonst seinen ersten Unterreiter. Alles Unbekannte landet in der Übersicht.
export function resolveAdminTab(tab, bereich) {
  if (tab !== OVERVIEW_TAB && Object.hasOwn(LEGACY_TABS, tab ?? '')) {
    const [main, sub] = LEGACY_TABS[tab]
    return { tab: main, bereich: sub }
  }
  const section = adminSection(tab) ?? adminSection(OVERVIEW_TAB)
  const sub = section.subs.find((item) => item.key === bereich) ?? section.subs[0]
  return { tab: section.key, bereich: sub.key }
}

// Ziel eines Sprungs: ein Hauptreiter (mit gemerktem/erstem Unterreiter), ein Unterreiter-Schlüssel oder ein alter Reiter.
export function adminTarget(key, bereich) {
  if (adminSection(key)) return resolveAdminTab(key, bereich)
  const section = sectionOfSub(key)
  if (section) return { tab: section.key, bereich: key }
  return resolveAdminTab(key)
}

// Adresse zum Paar - die Übersicht mit ihrem ersten Unterreiter ganz ohne Parameter.
export function writeAdminParams(params, { tab, bereich }) {
  const next = new URLSearchParams(params)
  if (tab === OVERVIEW_TAB && bereich === adminSection(OVERVIEW_TAB).subs[0].key) {
    next.delete(TAB_PARAM)
    next.delete(SUB_PARAM)
  } else {
    next.set(TAB_PARAM, tab)
    next.set(SUB_PARAM, bereich)
  }
  return next
}

// Zähler an den Unterreitern: nur, wo etwas offen ist (0 bleibt ohne Zahl - ruhiger).
export function adminSubCounts({ openRequests, pendingPosts, openMessages }) {
  const counts = {}
  if (openRequests > 0) counts.anfragen = openRequests
  if (pendingPosts > 0) counts.freigaben = pendingPosts
  if (openMessages > 0) counts.nachrichten = openMessages
  return counts
}

// Zähler an den Hauptreitern: die Summe ihrer Unterreiter.
export function adminTabCounts(todo) {
  const subCounts = adminSubCounts(todo)
  const counts = {}
  for (const section of ADMIN_SECTIONS) {
    const sum = section.subs.reduce((total, item) => total + (subCounts[item.key] ?? 0), 0)
    if (sum > 0) counts[section.key] = sum
  }
  return counts
}

// Vorgelesen am Zähler: "(2 offen)".
export function openCountText(count) {
  return `${count} offen`
}

export function adminPanelId(key) {
  return `admin-panel-${key}`
}

export function adminSubPanelId(key) {
  return `admin-bereich-${key}`
}
