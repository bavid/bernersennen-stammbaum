import { t } from './i18n/index.js'
// Hinweis-Glocke im Kopf (components/hinweise): Zahlen, Texte und die Liste aus den drei Quellen - offene „Mit dabei“-
// Anfragen (server/routes/erlebtMit.js), neue Gäste (server/routes/besuche.js) und Grüße zu eigenen Erinnerungen
// (server/routes/meineHinweise.js). Die Zahlen gehören zur Identität und stehen in /me (erlebtMitOffen, neueGaeste,
// neueGruesse) - an EINER Stelle, die Glocke und die Zeile auf Start lesen beide von dort.

// Höchstens so oft fragt die Glocke von selbst nach (nur bei sichtbarem Tab, nur im eigenen Zuhause).
export const REFRESH_MS = 2 * 60 * 1000
const MAX_BADGE = 99

const countOf = (value) => (Number.isInteger(value) && value > 0 ? value : 0)

// { anfragen, gaeste, gruesse } aus /me.
export function hinweisZahlen(family) {
  return {
    anfragen: countOf(family?.erlebtMitOffen),
    gaeste: countOf(family?.neueGaeste),
    gruesse: countOf(family?.neueGruesse)
  }
}

export function hinweisTotal(zahlen) {
  return zahlen.anfragen + zahlen.gaeste + zahlen.gruesse
}

// Neue family mit den Zahlen der Glocke - bei gleichen Zahlen dasselbe Objekt (setFamily rendert dann nicht neu).
export function withHinweisZahlen(family, zahlen) {
  if (!family) return family
  const next = { erlebtMitOffen: zahlen.anfragen, neueGaeste: zahlen.gaeste, neueGruesse: zahlen.gruesse }
  if (Object.keys(next).every((key) => family[key] === next[key])) return family
  return { ...family, ...next }
}

// Name des Knopfs für Screenreader („Hinweise, 2 neu“) - das Badge selbst ist aria-hidden.
export function bellLabel(total) {
  return total > 0 ? t('Hinweise, {n} neu', { n: total }) : t('Hinweise')
}

export function badgeText(total) {
  return total > MAX_BADGE ? `${MAX_BADGE}+` : String(total)
}

// „2 neue Hinweise“ - die schmale Zeile auf Start und die höfliche Ansage, wenn neue dazukommen.
export function startLineText(total) {
  return total === 1 ? t('{n} neuer Hinweis', { n: total }) : t('{n} neue Hinweise', { n: total })
}

// „Wilma war beim „Strandtag“ mit dabei?“ - dogName ist das eigene Tier, das im Eintrag des anderen Zuhauses steht.
export function requestText(request) {
  return t('{name} war beim „{titel}“ mit dabei?', { name: request.dogName, titel: request.titel })
}

export function guestText(guest) {
  return t('Neu bei euch zu Gast: {name}', { name: guest.name })
}

export function greetingText(greeting) {
  return t('{von} hat euch zu „{titel}“ gegrüßt', { von: greeting.von, titel: greeting.titel })
}

// Eine Liste aus allen drei Quellen, neueste zuerst: [{ kind, key, at, neu, data }]. Von den Gästen zählen nur die neuen
// (bestätigte stehen in „Meine Gäste“ im Einladen-Dialog); Anfragen sind immer neu, Grüße bringen neu vom Server mit.
export function hinweisItems({ anfragen = [], gaeste = [], gruesse = [] }) {
  const items = [
    ...anfragen.map((data) => ({ kind: 'anfrage', key: `anfrage-${data.requestId}`, at: data.angefragtAm || '', neu: true, data })),
    ...gaeste.filter((guest) => guest.neu).map((data) => ({ kind: 'gast', key: `gast-${data.id}`, at: data.seit || '', neu: true, data })),
    ...gruesse.map((data) => ({ kind: 'gruss', key: `gruss-${data.id}`, at: data.createdAt || '', neu: Boolean(data.neu), data }))
  ]
  return items.sort((a, b) => (a.at === b.at ? 0 : a.at < b.at ? 1 : -1))
}

// „Neu“ und „Früher“ - die Überschriften nur, wenn es beides gibt; sonst eine Gruppe ohne Überschrift.
export function hinweisGroups(items) {
  if (items.length === 0) return []
  const neu = items.filter((item) => item.neu)
  const frueher = items.filter((item) => !item.neu)
  if (neu.length === 0 || frueher.length === 0) return [{ key: 'alle', label: null, items }]
  return [
    { key: 'neu', label: 'Neu', items: neu },
    { key: 'frueher', label: 'Früher', items: frueher }
  ]
}
