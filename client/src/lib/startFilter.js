// Start, „Neue Erinnerungen“: Filter nach Zuhause (FilterChips wie über dem Tier-Raster, hooks/useGroupParam.js ?gruppe=…).
// Reine Hilfen: die Chips aus den geladenen Einträgen (je Bereich die Zahl), die Auswahl aus der Adresse, das Filtern der
// Seiten. Der Feed bringt zu jedem Eintrag seinen Bereich mit (area: { id, name, art: 'eigen' | 'familie' | 'besuch' },
// lib/startFeed.js) - gefiltert wird im Browser.
import { HOME_LABEL } from './areas.js'
import { OWN_GROUP_PARAM } from './familyGroups.js'
import { feedEntries } from './startFeed.js'

export const ALL_LABEL = 'Alle'

// Wert für ?gruppe=: das eigene Zuhause „eigen“ (wie in der Familienbande), sonst die Id des Bereichs.
export function areaParam(area) {
  if (!area || area.art === 'eigen' || area.id === undefined || area.id === null) return OWN_GROUP_PARAM
  return String(area.id)
}

function areaLabel(area, ownLabel) {
  if (!area || area.art === 'eigen') return ownLabel
  return area.name || ownLabel
}

// Chips über den Erinnerungen: „Alle“ und je Zuhause eins mit der Zahl seiner Erinnerungen - das eigene zuerst, die
// übrigen nach Namen. Gibt es nur ein Zuhause (oder noch nichts), keine Chips ([]).
export function areaOptions(items, { ownLabel = HOME_LABEL } = {}) {
  const entries = feedEntries(items)
  const groups = new Map()
  for (const entry of entries) {
    const param = areaParam(entry.area)
    const group = groups.get(param) || { param, label: areaLabel(entry.area, ownLabel), own: param === OWN_GROUP_PARAM, count: 0 }
    groups.set(param, { ...group, count: group.count + 1 })
  }
  if (groups.size < 2) return []
  const sorted = [...groups.values()].sort((a, b) => {
    if (a.own !== b.own) return a.own ? -1 : 1
    return a.label.localeCompare(b.label, 'de')
  })
  return [{ param: null, label: ALL_LABEL, count: entries.length }, ...sorted.map(({ param, label, count }) => ({ param, label, count }))]
}

// Die gewünschte Gruppe aus der Adresse - nur, wenn es sie in den Chips gibt; sonst „Alle“ (null).
export function selectedAreaParam(requested, options) {
  return requested && options.some((option) => option.param === requested) ? requested : null
}

export function filterByArea(items, param) {
  if (!param) return items
  return (items || []).filter((item) => areaParam(item.area) === param)
}

// Die geladenen Seiten gefiltert (Kapitel und „Weitere“ in StartNews rechnen danach wie gewohnt); null bleibt null.
export function filterPages(pages, param) {
  if (!pages || !param) return pages
  return pages.map((page) => filterByArea(page, param))
}
