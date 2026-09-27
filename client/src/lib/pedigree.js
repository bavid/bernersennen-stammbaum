// Reine Layout-Logik für den Stammbaum: Generationen, Reihenfolge und Verbindungen.
import { formatDateShort, yearOf } from './dates.js'

function byBirthThenName(a, b) {
  const da = a.geburtsdatum || '9999'
  const dbirth = b.geburtsdatum || '9999'
  if (da !== dbirth) return da < dbirth ? -1 : 1
  return a.name.localeCompare(b.name)
}

function parentIds(dog, nodeIds) {
  return [dog.mother_dog_id, dog.father_dog_id].filter((id) => id && nodeIds.has(id))
}

// Eigene Hunde + verlinkte Eltern aus anderen Rudeln (als "extern" markiert).
export function collectNodes(ownDogs, allDogs = []) {
  const ownIds = new Set(ownDogs.map((d) => d.id))
  const allById = new Map(allDogs.map((d) => [d.id, d]))
  const external = new Map()
  for (const dog of ownDogs) {
    for (const id of [dog.mother_dog_id, dog.father_dog_id]) {
      if (id && !ownIds.has(id) && allById.has(id)) external.set(id, { ...allById.get(id), external: true })
    }
  }
  return [...ownDogs, ...external.values()]
}

function computeGenerations(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const ownIds = new Set(nodes.filter((n) => !n.external).map((n) => n.id))
  const generation = new Map()

  function generationOf(id, visiting) {
    if (generation.has(id)) return generation.get(id)
    if (visiting.has(id)) return 0 // Zyklus-Schutz
    visiting.add(id)
    const parents = parentIds(byId.get(id), ownIds)
    const value = parents.length ? Math.max(...parents.map((p) => generationOf(p, visiting))) + 1 : 0
    generation.set(id, value)
    return value
  }
  nodes.filter((n) => !n.external).forEach((n) => generationOf(n.id, new Set()))

  const childGenerations = (node) =>
    nodes
      .filter((c) => !c.external && (c.mother_dog_id === node.id || c.father_dog_id === node.id))
      .map((c) => generation.get(c.id))

  // Hunde ohne erfasste Eltern rücken direkt über ihr frühestes Kind (neben den Partner),
  // statt ganz oben zu stehen und mit langen Linien durch fremde Karten zu laufen.
  for (const node of nodes.filter((n) => !n.external && !parentIds(n, ownIds).length)) {
    const childGens = childGenerations(node)
    if (childGens.length) generation.set(node.id, Math.max(generation.get(node.id), Math.min(...childGens) - 1))
  }

  // Externe Eltern sitzen ebenso eine Generation über ihrem frühesten Kind.
  for (const node of nodes.filter((n) => n.external)) {
    generation.set(node.id, Math.min(...childGenerations(node)) - 1)
  }

  const minGen = Math.min(0, ...generation.values())
  for (const [id, gen] of generation) generation.set(id, gen - minGen)
  return generation
}

function positionsOf(rows) {
  const pos = new Map()
  rows.forEach((row) => row.forEach((node, i) => pos.set(node.id, (i + 1) / (row.length + 1))))
  return pos
}

function barycenterSort(row, neighbourIds, pos) {
  const scored = row.map((node, index) => {
    const known = neighbourIds(node).filter((id) => pos.has(id))
    const score = known.length ? known.reduce((sum, id) => sum + pos.get(id), 0) / known.length : pos.get(node.id)
    return { node, score, index }
  })
  scored.sort((a, b) => a.score - b.score || byBirthThenName(a.node, b.node) || a.index - b.index)
  return scored.map((s) => s.node)
}

// Verbindungen "lebt zusammen mit" zwischen Tieren, die im Baum stehen
export function housematePairs(links = [], nodes) {
  const ids = new Set(nodes.map((n) => n.id))
  return links.filter((l) => ids.has(l.dog_a_id) && ids.has(l.dog_b_id)).map((l) => [l.dog_a_id, l.dog_b_id])
}

const linkedTo = (id, pairs) => pairs.flatMap(([a, b]) => (a === id ? [b] : b === id ? [a] : []))

// Tiere ohne Abstammung im Baum (keine Eltern, keine Kinder), die mit jemandem zusammenleben –
// z. B. Adoptiv-Geschwister. Liefert Map: id -> id des Tieres, bei dem sie wohnen.
export function adoptiveAnchors(nodes, links = []) {
  const ids = new Set(nodes.map((n) => n.id))
  const pairs = housematePairs(links, nodes)
  const hasPedigree = (node) =>
    parentIds(node, ids).length > 0 || nodes.some((c) => c.mother_dog_id === node.id || c.father_dog_id === node.id)
  const anchors = new Map()
  for (const node of nodes) {
    if (hasPedigree(node)) continue
    const partner = linkedTo(node.id, pairs)
      .map((id) => nodes.find((n) => n.id === id))
      .find((other) => other && hasPedigree(other))
    if (partner) anchors.set(node.id, partner.id)
  }
  return anchors
}

// Liefert Zeilen (je Generation) in einer Reihenfolge mit möglichst wenig Kreuzungen.
// Adoptiv-Tiere stehen nicht in den Reihen, sondern in der Mitbewohner-Reihe darunter (housemateLanes).
export function layoutPedigree(allNodes, links = []) {
  const anchors = adoptiveAnchors(allNodes, links)
  const nodes = allNodes.filter((n) => !anchors.has(n.id))
  if (!nodes.length) return []
  const nodeIds = new Set(nodes.map((n) => n.id))
  const generation = computeGenerations(nodes)
  const rowCount = Math.max(...generation.values()) + 1
  let rows = Array.from({ length: rowCount }, () => [])
  nodes.forEach((n) => rows[generation.get(n.id)].push(n))
  rows = rows.map((row) => [...row].sort(byBirthThenName))

  const childrenOf = (node) =>
    nodes.filter((c) => c.mother_dog_id === node.id || c.father_dog_id === node.id).map((c) => c.id)

  for (let pass = 0; pass < 3; pass += 1) {
    for (let g = 1; g < rowCount; g += 1) {
      rows[g] = barycenterSort(rows[g], (n) => parentIds(n, nodeIds), positionsOf(rows))
    }
    for (let g = rowCount - 2; g >= 0; g -= 1) {
      rows[g] = barycenterSort(rows[g], childrenOf, positionsOf(rows))
    }
  }

  return rows.filter((row) => row.length)
}

// Mitbewohner-Reihe unter jeder Generation: je Haupttier seine Adoptiv-Tiere, in der Reihenfolge der Reihe
export function housemateLanes(rows, anchors) {
  const byAnchor = new Map()
  for (const [id, anchorId] of anchors) byAnchor.set(anchorId, [...(byAnchor.get(anchorId) || []), id])
  return rows.map((row) =>
    row.filter((dog) => byAnchor.has(dog.id)).map((dog) => ({ anchorId: dog.id, memberIds: byAnchor.get(dog.id) }))
  )
}

// Fasst "lebt zusammen"-Paare einer Reihe zu Haushalten zusammen (eine Klammer statt vieler Bögen).
// Paare über Generationen hinweg bleiben einzeln.
export function housemateGroups(pairs, rowOf) {
  const root = new Map()
  const find = (id) => {
    let current = id
    while (root.get(current) !== current) current = root.get(current)
    return current
  }
  const crossRow = []
  for (const [a, b] of pairs) {
    if (rowOf.get(a) !== rowOf.get(b)) {
      crossRow.push([a, b])
      continue
    }
    for (const id of [a, b]) if (!root.has(id)) root.set(id, id)
    root.set(find(a), find(b))
  }
  const groups = new Map()
  for (const id of root.keys()) groups.set(find(id), [...(groups.get(find(id)) || []), id])
  const households = [...groups.values()].map((ids) => ids.sort((x, y) => x - y)).sort((x, y) => x[0] - y[0])
  return { households, crossRow }
}

// Geburtsangabe einer Generation: gemeinsames Datum ("14.05.2026"), ein Jahr oder eine Spanne.
export function generationDates(row) {
  const dates = row.map((dog) => dog.geburtsdatum).filter(Boolean).sort()
  if (!dates.length) return null
  if (dates[0] === dates[dates.length - 1]) return formatDateShort(dates[0])
  const first = yearOf(dates[0])
  const last = yearOf(dates[dates.length - 1])
  return first === last ? String(first) : `${first}–${last}`
}

// Gruppiert Kinder nach Elternpaar -> eine Verbindung ("Union") pro Wurf/Paar.
export function computeUnions(nodes) {
  const nodeIds = new Set(nodes.map((n) => n.id))
  const unions = new Map()
  for (const child of nodes) {
    const parents = parentIds(child, nodeIds)
    if (!parents.length) continue
    const key = parents.join('+')
    if (!unions.has(key)) unions.set(key, { key, parents, children: [] })
    unions.get(key).children.push(child.id)
  }
  return [...unions.values()]
}
