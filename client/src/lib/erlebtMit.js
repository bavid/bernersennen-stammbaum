// "Erlebt mit" (Phase V2, server/lib/erlebtMit.js): Texte und kleine Helfer für Markierungen, Anfragen und
// gespiegelte Einträge.
import { t } from './i18n/index.js'

const UNKNOWN_NAME = 'Unbekannt'

function animalName(name, nameUnbekannt) {
  return nameUnbekannt || !name ? t(UNKNOWN_NAME) : name
}

// Chip am eigenen Eintrag: "erlebt mit Wilma" (noch nicht bestätigt: "erlebt mit Wilma (angefragt)"). Ist das andere
// Zuhause nicht mehr verbunden (getrennt, security-review V2), nennt der Server den Namen nicht mehr.
export function tagLabel(tag) {
  if (tag.getrennt) return t('mit dabei: ein früher verbundenes Tier')
  const base = t('mit dabei: {name}', { name: animalName(tag.name, tag.nameUnbekannt) })
  return tag.status === 'offen' ? t('{label} (angefragt)', { label: base }) : base
}

// Gespiegelter Eintrag in der Chronik des eigenen Tiers: "erlebt mit Balu · Zuhause am Deich"
export function mirrorLabel(gespiegelt) {
  return `${t('mit dabei: {name}', { name: animalName(gespiegelt.tier, gespiegelt.tierNameUnbekannt) })} · ${gespiegelt.zuhause}`
}

// Ist das Zuhause, aus dem ein gespiegelter Eintrag stammt, eines, das man besuchen kann (me.besuche)?
export function canVisitOrigin(family, gespiegelt) {
  return Boolean(family?.besuche?.some((visit) => visit.id === gespiegelt?.zuhauseId))
}

// Tier-Ids der (nicht abgelehnten) Markierungen eines Eintrags - Vorbelegung im Formular; getrennte fallen weg
// (sie ließen sich ohnehin nicht mehr markieren).
export function taggedDogIds(entry) {
  return (entry?.erlebt_mit || []).filter((tag) => !tag.getrennt).map((tag) => tag.dogId)
}

// Anfragen je Zuhause (für „Alle von {Zuhause} ablehnen“): [{ zuhauseId, zuhause, count }] mit mindestens zwei.
export function requestGroups(requests) {
  const groups = new Map()
  for (const request of requests) {
    const group = groups.get(request.zuhauseId) || { zuhauseId: request.zuhauseId, zuhause: request.zuhause, count: 0 }
    groups.set(request.zuhauseId, { ...group, count: group.count + 1 })
  }
  return [...groups.values()].filter((group) => group.count > 1)
}
