// "Erlebt mit" (Phase V2, server/lib/erlebtMit.js): Texte und kleine Helfer für Markierungen, Anfragen und
// gespiegelte Einträge.

const UNKNOWN_NAME = 'Unbekannt'

function animalName(name, nameUnbekannt) {
  return nameUnbekannt || !name ? UNKNOWN_NAME : name
}

// Chip am eigenen Eintrag: "erlebt mit Wilma" (noch nicht bestätigt: "erlebt mit Wilma (angefragt)"). Ist das andere
// Zuhause nicht mehr verbunden (getrennt, security-review V2), nennt der Server den Namen nicht mehr.
export function tagLabel(tag) {
  if (tag.getrennt) return 'erlebt mit einem früher verbundenen Tier'
  const base = `erlebt mit ${animalName(tag.name, tag.nameUnbekannt)}`
  return tag.status === 'offen' ? `${base} (angefragt)` : base
}

// Anfrage an die Besitzer des markierten Tiers: "Wilma war dabei – übernehmen?"
export function requestQuestion(request) {
  return `${request.dogName} war dabei – übernehmen?`
}

// Gespiegelter Eintrag in der Chronik des eigenen Tiers: "erlebt mit Balu · Zuhause am Deich"
export function mirrorLabel(gespiegelt) {
  return `erlebt mit ${animalName(gespiegelt.tier, gespiegelt.tierNameUnbekannt)} · ${gespiegelt.zuhause}`
}

// Ist das Zuhause, aus dem ein gespiegelter Eintrag stammt, eines, das man besuchen kann (me.besuche)?
export function canVisitOrigin(family, gespiegelt) {
  return Boolean(family?.besuche?.some((visit) => visit.id === gespiegelt?.zuhauseId))
}

// Neue family mit geänderter Zahl offener Anfragen (für das Badge) - gleiche Zahl: dasselbe Objekt.
export function withErlebtMitOffen(family, offen) {
  if (!family || family.erlebtMitOffen === offen) return family
  return { ...family, erlebtMitOffen: offen }
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
