// Phase W, Schritt 2: das Tierprofil /tier/:id (pages/DogDetailPage.jsx) - kompakter Kopf und Reiter in der Adresse
// (?reiter=…). Reine Hilfen ohne React.
import { animalsRoute } from './areas.js'
import { companionLine } from './companions.js'
import { ageText, formatDateLong, todayIso } from './dates.js'
import { isVisit } from './visits.js'
import { t } from './i18n/index.js'

export const DOG_TAB_PARAM = 'reiter'
export const CHRONICLE_TAB = 'chronik'

// Haushalte und Familien: Chronik · Infos · Verwandte. Eigene Tiere eines Tierheims behalten ihre Reiter:
// Chronik · Vermittlung · Infos.
export function dogTabs({ shelter = false } = {}) {
  if (shelter) {
    return [
      { key: CHRONICLE_TAB, label: t('Chronik') },
      { key: 'vermittlung', label: t('Vermittlung') },
      { key: 'infos', label: t('Infos') }
    ]
  }
  return [
    { key: CHRONICLE_TAB, label: t('Chronik') },
    { key: 'infos', label: t('Infos') },
    { key: 'verwandte', label: t('Verwandte') }
  ]
}

// Die eine Zeile unter dem Namen: "Mischling · 7 Jahre · bei euch seit 12. Juni 2021". Für ein hierher geteiltes Tier
// "im {ownerName} seit …"; gegangene Tiere ohne Alter, dafür die Zeit bei euch ("In Erinnerung · 2008–2019", memorial).
// stay: false lässt "seit …" weg - für ein Tier, das nicht euch gehört, sagt die Zeile darunter, wo es lebt (originLine).
export function dogHeadLine(dog, { ownerName, stay = true, today = todayIso() } = {}) {
  const gone = Boolean(dog.bei_uns_bis)
  const parts = [dog.rasse || null]
  if (!gone && dog.geburtsdatum) parts.push(ageText(dog.geburtsdatum, today))
  let memorial = false
  if (gone) {
    const line = companionLine(dog, ownerName ? { ownerName } : undefined)
    if (line) parts.push(line.text)
    memorial = Boolean(line?.memorial)
  } else if (dog.bei_uns_seit && stay) {
    parts.push(t('{where} seit {date}', { where: ownerName ? t('im {name}', { name: ownerName }) : t('bei euch'), date: formatDateLong(dog.bei_uns_seit) }))
  }
  return { text: parts.filter(Boolean).join(' · '), memorial }
}

// Wessen Zeit „seit …“ zählt: der Name des Zuhauses für ein Tier, das nicht euch gehört (dog.familyName) - für eigene Tiere
// (auch ein eigenes, in eine Familie geteiltes) und Tiere des Bereichs selbst undefined („bei euch“). Kopf und Infos gleich.
export function stayOwnerName(dog, family) {
  if (!dog || dog.canEdit) return undefined
  const yours = dog.ownerFamilyId != null && dog.ownerFamilyId === family?.home?.id
  return yours ? undefined : dog.familyName || undefined
}

// Für ein Tier, das nicht euch gehört (dog.familyName: sein Zuhause, GET /api/dogs/:id): wo es lebt und wie ihr es seht -
// "lebt bei Zuhause Möwenweg · geteilt mit euch über Familie Sonnenhang" (in einer Familie) bzw. "lebt bei Zuhause Lindenhof ·
// ihr lest mit" (ein vermitteltes Tier im Tierheim). null für eigene Tiere (auch ein eigenes, in die Familie geteiltes), für
// Tiere des Bereichs selbst und zu Besuch (dort sagt es der Besuchs-Chip im Kopf).
export function originLine(dog, family) {
  if (!dog?.familyName || dog.canEdit || isVisit(family)) return null
  if (dog.ownerFamilyId === family?.id || dog.ownerFamilyId === family?.home?.id) return null
  const via = family?.art === 'rudel' ? t('geteilt mit euch über {name}', { name: family.name }) : family?.art === 'tierheim' ? t('ihr lest mit') : null
  return [t('lebt bei {name}', { name: dog.familyName }), via].filter(Boolean).join(' · ')
}

// "Sichtbar in: Familie Sonnenhang" - die Familien, in die ein eigenes Tier geteilt ist (dog.shares, Ids), mit dem Namen
// aus me.memberships, in deren Reihenfolge.
export function visibleInNames(dog, memberships = []) {
  const shares = new Set(dog?.shares || [])
  return (memberships || []).filter((membership) => shares.has(membership.id)).map((membership) => membership.name)
}

// Gibt es Verwandte, für die sich der Stammbaum lohnt? Eingetragene Eltern, Geschwister oder Nachwuchs - ein Elternteil,
// der nur dem Namen nach bekannt ist (Freitext), steht im Stammbaum nicht als eigene Karte.
export function hasRelatives(dog) {
  return Boolean(dog.mother || dog.father || dog.siblings?.length || dog.children?.length)
}

// "Im Stammbaum ansehen": der Reiter Stammbaum dort, wo man die Tiere dieses Bereichs sieht.
export function treeRoute(family) {
  const base = animalsRoute(family)
  return `${base}${base.includes('?') ? '&' : '?'}ansicht=stammbaum`
}

// Zurück-Link aus location.state.from (z. B. vom Start-Feed): nur ein Pfad dieser App - nie "//host", eine Adresse oder
// Steuerzeichen (security-review W2: aus "/<Tab>/host" machte der Browser "//host").
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

export function safeFromPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null
  return CONTROL_CHARS.test(value) ? null : value
}

// Die Chronik zeigt zuerst nur die jüngsten RECENT_ITEMS Einträge (Phase W, Schritt 2: höchstens etwa drei Bildschirme je
// Reiter) - davor bzw. dahinter "Frühere … anzeigen". Ein Ziel (#entry-N, gerade gespeichert) im verborgenen Teil zeigt
// alles. items in Anzeige-Reihenfolge (newestFirst: die jüngsten vorn). hidden: wie viele verborgen sind.
export const RECENT_ITEMS = 4

// Ein einzelner verborgener Punkt lohnt keinen Knopf - erst ab zweien wird gekürzt.
export function recentItems(items, { newestFirst = false, showAll = false, keepKey = null, limit = RECENT_ITEMS } = {}) {
  if (showAll || items.length <= limit + 1) return { shown: items, hidden: 0 }
  const shown = newestFirst ? items.slice(0, limit) : items.slice(items.length - limit)
  if (keepKey && !shown.some((item) => item.key === keepKey) && items.some((item) => item.key === keepKey)) {
    return { shown: items, hidden: 0 }
  }
  return { shown, hidden: items.length - limit }
}
