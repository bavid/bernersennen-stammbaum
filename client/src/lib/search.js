// Suche (components/search, server POST /api/suche): Gruppen, Ziele der Treffer, Abkürzungen, der Verlauf auf diesem Gerät
// und die Liste der Optionen für die Tastatur (Combobox mit aria-activedescendant).
import { groupRoute, isHouseholdIdentity } from './areas.js'
import { canInvite } from './accountMenu.js'
import { matchesQuery, foldText } from './searchFold.js'
import { readSetting, removeSetting, writeSetting } from './storage.js'

export const MIN_QUERY_LENGTH = 2
export const MAX_QUERY_LENGTH = 80
export const SEARCH_DELAY_MS = 250
export const VISIBLE_PER_GROUP = 5
export const MAX_RECENT = 5

// Reihenfolge der Gruppen im Ergebnis; die letzte (Abkürzungen) entsteht ohne Server.
export const SERVER_GROUPS = ['tiere', 'erinnerungen', 'pinnwand', 'familien', 'partner']
export const SHORTCUT_GROUP = 'abkuerzungen'
export const GROUP_ORDER = [...SERVER_GROUPS, SHORTCUT_GROUP]

// Überschriften - "Tiere"/"Familien" mit den Wörtern des Auftritts (Berner: Hunde/Rudel).
export function groupTitles(words) {
  return {
    tiere: words.animals,
    erinnerungen: words.entries,
    pinnwand: 'Pinnwand & Termine',
    familien: `${words.groups} & befreundete Zuhause`,
    partner: 'Partner',
    [SHORTCUT_GROUP]: 'Abkürzungen'
  }
}

export function searchableQuery(value) {
  const query = String(value ?? '').replace(/\s+/g, ' ').trim()
  return [...query].length >= MIN_QUERY_LENGTH ? query : null
}

// Ids kommen als Zahlen vom Server - trotzdem kodiert, damit nie ein fremdes Zeichen in die Adresse gerät.
const seg = (value) => encodeURIComponent(String(value))

// Wohin ein Treffer führt - das AreaGate der Zielroute wechselt bei Bedarf selbst in den Bereich (?in=, /familien/:id).
// Die Pinnwand des eigenen Zuhauses: /pinnwand?in=home (AreaRoutes.jsx PinboardRoute), die einer Familie ist ihr Reiter.
export function resultTarget(group, item) {
  if (group === 'tiere') return `/tier/${seg(item.id)}?in=${seg(item.bereich.id)}`
  if (group === 'erinnerungen') return `/tier/${seg(item.tier.id)}?in=${seg(item.bereich.id)}#entry-${seg(item.id)}`
  if (group === 'pinnwand') return item.bereich.art === 'eigen' ? '/pinnwand?in=home' : groupRoute(seg(item.bereich.id), 'pinnwand')
  if (group === 'familien') return groupRoute(seg(item.id))
  if (group === 'partner') return `/p/${encodeURIComponent(item.slug)}`
  return null
}

// Abkürzungen: feste Ziele aus dem Konto-Menü, gefunden über Wörter, die man dafür tippen könnte. { key, label, icon,
// to | action, keywords } - Einladen und Beitreten nur, wo es sie gibt (wie lib/accountMenu.js).
export function shortcutsFor(family, words) {
  return [
    {
      key: 'einstellungen',
      label: 'Einstellungen',
      icon: 'settings',
      to: '/einstellungen',
      keywords: ['einstellungen', 'konto', 'darstellung', 'farbe', 'schrift', 'dunkel', 'hell', 'schlüssel', 'passwort', 'zugang', 'benutzer', 'optionen']
    },
    {
      key: 'bilderrahmen',
      label: 'Bilderrahmen',
      icon: 'frame',
      to: '/bilderrahmen',
      keywords: ['bilderrahmen', 'diashow', 'rahmen', 'fotos zeigen', 'tablet', 'fernseher', 'slideshow']
    },
    canInvite(family) && {
      key: 'einladen',
      label: 'Einladen',
      icon: 'send',
      action: 'invite',
      keywords: ['einladen', 'einladung', 'besuch', 'verschenken', 'code', 'freunde', 'gutschein']
    },
    {
      key: 'collage',
      label: 'Fotocollage',
      icon: 'collage',
      to: '/collage',
      keywords: ['fotocollage', 'collage', 'fotos', 'bilder', 'poster', 'drucken']
    },
    {
      key: 'hilfe',
      label: 'Hilfe & Kontakt',
      icon: 'message',
      to: '/admin-schreiben',
      keywords: ['hilfe', 'kontakt', 'frage', 'problem', 'fehler', 'support', 'nachricht', 'schreiben']
    },
    isHouseholdIdentity(family) && {
      key: 'beitreten',
      label: `${words.group} beitreten`,
      icon: 'users',
      to: '/familien',
      keywords: ['beitreten', 'familie', 'rudel', 'gründen', 'mitglied', words.group]
    }
  ].filter(Boolean)
}

export function matchShortcuts(shortcuts, query) {
  if (!searchableQuery(query)) return []
  return shortcuts.filter((shortcut) => [shortcut.label, ...shortcut.keywords].some((word) => matchesQuery(word, query)))
}

// Verlauf: die letzten Suchen nur auf diesem Gerät (localStorage, lib/storage.js fängt Fehler ab) - je Zuhause getrennt,
// damit ein anderer Haushalt am selben Gerät nicht sieht, wonach man gesucht hat.
const recentKey = (family) => `suche.verlauf.${family?.home?.id ?? family?.id ?? 'x'}`

export function loadRecent(family) {
  const stored = readSetting(recentKey(family), [])
  if (!Array.isArray(stored)) return []
  return stored.filter((entry) => typeof entry === 'string' && searchableQuery(entry) && entry.length <= MAX_QUERY_LENGTH).slice(0, MAX_RECENT)
}

// Neue Liste (die alte bleibt unverändert): die Suche nach vorn, gleiche (nach Faltung) einmal, höchstens MAX_RECENT.
export function withRecent(list, query) {
  const cleaned = searchableQuery(query)
  if (!cleaned) return list
  const key = foldText(cleaned)
  return [cleaned, ...list.filter((entry) => foldText(entry) !== key)].slice(0, MAX_RECENT)
}

export function saveRecent(family, list) {
  writeSetting(recentKey(family), list)
}

export function clearRecent(family) {
  removeSetting(recentKey(family))
}

// Abschnitte fürs Ergebnis: je Gruppe mit Treffern { key, title, options, more } - höchstens VISIBLE_PER_GROUP Treffer und
// dahinter "Alle n anzeigen" als eigene Option (kind 'expand'), außer die Gruppe ist aufgeklappt (expanded).
// more: der Server hätte noch mehr (genauer suchen). Jede Option trägt eine eindeutige DOM-Id (idPrefix).
export function buildSections({ gruppen, shortcuts, expanded, titles, idPrefix }) {
  const groups = { ...(gruppen || {}), [SHORTCUT_GROUP]: { treffer: shortcuts || [], mehr: false } }
  return GROUP_ORDER.filter((key) => groups[key]?.treffer?.length > 0).map((key) => {
    const { treffer, mehr } = groups[key]
    const open = expanded.includes(key) || treffer.length <= VISIBLE_PER_GROUP
    const shown = open ? treffer : treffer.slice(0, VISIBLE_PER_GROUP)
    const options = shown.map((item) => ({ id: `${idPrefix}-${key}-${item.id ?? item.key}`, kind: 'result', group: key, item }))
    if (!open) options.push({ id: `${idPrefix}-${key}-alle`, kind: 'expand', group: key, count: treffer.length })
    return { key, title: titles[key], options, more: open && Boolean(mehr) }
  })
}

// Vor dem Tippen: die letzten Suchen als eigener Abschnitt - mit den Pfeiltasten erreichbar wie jeder Treffer.
export const RECENT_GROUP = 'verlauf'

export function recentSections(recent, idPrefix) {
  if (!recent?.length) return []
  const options = recent.map((query, index) => ({ id: `${idPrefix}-${RECENT_GROUP}-${index}`, kind: 'recent', group: RECENT_GROUP, item: { query } }))
  return [{ key: RECENT_GROUP, title: 'Zuletzt gesucht', options, more: false }]
}

export function flattenOptions(sections) {
  return sections.flatMap((section) => section.options)
}

export function countResults(gruppen, shortcuts) {
  const fromServer = Object.values(gruppen || {}).reduce((sum, group) => sum + (group?.treffer?.length || 0), 0)
  return fromServer + (shortcuts?.length || 0)
}
