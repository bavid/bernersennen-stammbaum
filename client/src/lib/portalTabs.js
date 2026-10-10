// Reiter des Partner-Portals (/p/:slug und die Kundensicht, PartnerPortalPage/PortalTabs): statt eines langen Stapels
// aus Angeboten, Terminen, Einblicken, Tieren und Kontakt eine Reiter-Leiste unter dem Kopf - "Übersicht" zuerst. Alle
// Inhalte kommen weiter auf einmal (die Seite bleibt für Suchmaschinen vollständig), die Reiter blenden nur um. Der
// gewählte Reiter steht in der Adresse (?reiter=termine), alte Sprungmarken (#kontakt, #partner-portal-termine, …)
// führen zum passenden Reiter. Reine Funktionen über die Portal-Daten.
import { isAllowedMedia } from './discover.js'
import { todayIso } from './dates.js'
import { t } from './i18n/index.js'
import { PORTAL_MONATE, splitByHorizon } from './termine.js'

export const PORTAL_TAB_PARAM = 'reiter'
export const OVERVIEW_TAB = 'uebersicht'
export const CONTACT_TAB = 'kontakt'
// „Wir waren hier“ - nur mit einer Sitzung im eigenen Zuhause (PartnerPortalPage, data.wirWarenHier).
export const WWH_TAB = 'wir-waren-hier'

// Abschnitte im Portal (Ids der PortalSection-Abschnitte, gutschein: die Karte PortalCodeNote) - Sprungziele für
// Kopf-Knöpfe und alte Links.
export const SECTION_IDS = Object.freeze({
  posts: 'partner-portal-posts',
  termine: 'partner-portal-termine',
  einblicke: 'portal-einblicke',
  animals: 'partner-portal-animals',
  happyEnds: 'partner-portal-happy-ends',
  contact: 'partner-portal-contact',
  gutschein: 'partner-portal-gutschein'
})

// Die Übersicht bleibt kurz: die ersten Angebote und die nächsten Termine, der Rest steht im eigenen Reiter.
export const OVERVIEW_POSTS = 2
export const OVERVIEW_TERMINE = 3

// Tiere gleich nach der Übersicht: bei einem Tierheim sind sie der Grund des Besuchs - und am Handy stünde der Reiter
// sonst rechts außerhalb der Leiste.
const TAB_DEFS = [
  { key: OVERVIEW_TAB, label: 'Übersicht' },
  { key: 'tiere', label: 'Tiere' },
  { key: 'angebote', label: 'Angebote' },
  { key: 'termine', label: 'Termine' },
  { key: 'einblicke', label: 'Einblicke' },
  { key: WWH_TAB, label: 'Wir waren hier' },
  { key: CONTACT_TAB, label: 'Kontakt' }
]

const COUNT_WORDS = {
  angebote: ['{n} Angebot', '{n} Angebote'],
  termine: ['{n} Termin', '{n} Termine'],
  einblicke: ['{n} Einblick', '{n} Einblicke'],
  tiere: ['{n} Tier', '{n} Tiere']
}

// Alte Sprungmarken (Abschnitts-Ids von vor den Reitern und kurze Namen) -> Reiter und Abschnitt darin.
const HASH_TARGETS = {
  kontakt: { tab: CONTACT_TAB, target: SECTION_IDS.contact },
  'schreib-uns': { tab: CONTACT_TAB, target: SECTION_IDS.contact },
  [SECTION_IDS.contact]: { tab: CONTACT_TAB, target: SECTION_IDS.contact },
  gutschein: { tab: CONTACT_TAB, target: SECTION_IDS.gutschein },
  'gutschein-einloesen': { tab: CONTACT_TAB, target: SECTION_IDS.gutschein },
  [SECTION_IDS.gutschein]: { tab: CONTACT_TAB, target: SECTION_IDS.gutschein },
  angebote: { tab: 'angebote', target: SECTION_IDS.posts },
  aktuelles: { tab: 'angebote', target: SECTION_IDS.posts },
  [SECTION_IDS.posts]: { tab: 'angebote', target: SECTION_IDS.posts },
  termine: { tab: 'termine', target: SECTION_IDS.termine },
  [SECTION_IDS.termine]: { tab: 'termine', target: SECTION_IDS.termine },
  einblicke: { tab: 'einblicke', target: SECTION_IDS.einblicke },
  [SECTION_IDS.einblicke]: { tab: 'einblicke', target: SECTION_IDS.einblicke },
  'partner-portal-einblicke': { tab: 'einblicke', target: SECTION_IDS.einblicke },
  tiere: { tab: 'tiere', target: SECTION_IDS.animals },
  [SECTION_IDS.animals]: { tab: 'tiere', target: SECTION_IDS.animals },
  'happy-ends': { tab: 'tiere', target: SECTION_IDS.happyEnds },
  [SECTION_IDS.happyEnds]: { tab: 'tiere', target: SECTION_IDS.happyEnds }
}

function asList(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []
}

// Termine der Portal-Antwort (Vorkommen der nächsten zwölf Monate) - nur, was Datum und Titel hat.
export function portalTermine(value) {
  return asList(value).filter((item) => typeof item.datum === 'string' && typeof item.titel === 'string')
}

// Die nächsten n Vorkommen, die stattfinden (abgesagte nicht) - für die Übersicht.
export function nextTermine(items, count) {
  return items.filter((item) => !item.abgesagt).slice(0, count)
}

// Was der Reiter "Termine" zuerst zeigt (PortalTermine): die nächsten drei Monate - findet darin nichts statt, gleich
// alle (sonst stünde dort nur Abgesagtes oder gar nichts). Den Rest zeigt "Mehr anzeigen".
export function initialTermine(items, today = todayIso()) {
  const { sichtbar } = splitByHorizon(items, today, PORTAL_MONATE)
  return sichtbar.some((item) => !item.abgesagt) ? sichtbar : items
}

// Zähler am Reiter "Termine" (Feedback-Runde): so viele Tage, wie der Reiter zuerst zeigt und die stattfinden - jede
// Woche einer Serie einzeln, wie in der Liste (vorher zählte eine Serie einmal: "Termine 3" über einer langen Liste).
// Abgesagte stehen durchgestrichen in der Liste, zählen aber nicht; fällt alles aus, fehlt der Reiter.
export function upcomingTerminCount(items, today = todayIso()) {
  return initialTermine(items, today).filter((item) => !item.abgesagt).length
}

// Einblicke, die die Galerie zeigt: öffentlich nur /public-media, in der Kundensicht auch die eigenen über /uploads.
export function galleryEinblicke(einblicke, { preview = false } = {}) {
  return asList(einblicke).filter((einblick) => isAllowedMedia(einblick.fotoUrl, { preview }))
}

// today: nur für Tests, sonst heute.
function sizes({ posts, termine, einblicke, animals, happyEnds, preview = false, today = todayIso() }) {
  return {
    angebote: asList(posts).length,
    termine: upcomingTerminCount(portalTermine(termine), today),
    einblicke: galleryEinblicke(einblicke, { preview }).length,
    tiere: asList(animals).length,
    happyEnds: asList(happyEnds).length
  }
}

// Sichtbare Reiter: Übersicht immer, die übrigen nur mit Inhalt. Tiere auch mit nur Happy Ends. Kontakt, solange
// data.kontakt nicht false ist (PortalBody: ein Kontaktweg des Partners oder die Karte zum Einladungscode).
export function portalTabs(data) {
  const n = sizes(data)
  const hasContent = {
    angebote: n.angebote > 0,
    termine: n.termine > 0,
    einblicke: n.einblicke > 0,
    tiere: n.tiere + n.happyEnds > 0,
    [WWH_TAB]: data.wirWarenHier === true,
    [CONTACT_TAB]: data.kontakt !== false
  }
  return TAB_DEFS.filter((tab) => hasContent[tab.key] ?? true)
}

// Zähler je Reiter (TabBar counts) - nur, wo es etwas zu zählen gibt.
export function portalCounts(data) {
  const n = sizes(data)
  const counts = {}
  for (const key of ['tiere', 'angebote', 'termine', 'einblicke']) {
    if (n[key] > 0) counts[key] = n[key]
  }
  return counts
}

// Vorgelesen am Zähler: "(2 Angebote)", "(1 Termin)".
export function tabCountText(count, key) {
  const [one, many] = COUNT_WORDS[key] || ['{n} Treffer', '{n} Treffer']
  return t(count === 1 ? one : many, { n: count })
}

// "#kontakt" -> { tab: 'kontakt', target: 'partner-portal-contact' }; Unbekanntes -> null.
export function hashTarget(hash) {
  if (typeof hash !== 'string' || hash.length < 2) return null
  let name
  try {
    name = decodeURIComponent(hash.slice(1)).trim().toLowerCase()
  } catch {
    return null
  }
  return Object.hasOwn(HASH_TARGETS, name) ? HASH_TARGETS[name] : null
}

// Der gewählte Reiter: ?reiter= (nur ein sichtbarer), sonst eine alte Sprungmarke, sonst die Übersicht.
export function resolvePortalTab({ param, hash, keys }) {
  if (keys.includes(param)) return param
  const fromHash = hashTarget(hash)
  if (fromHash && keys.includes(fromHash.tab)) return fromHash.tab
  return OVERVIEW_TAB
}
