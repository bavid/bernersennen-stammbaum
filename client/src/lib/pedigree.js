// Reine Layout-Logik für den Stammbaum: Generationen, Reihenfolge und Verbindungen.

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

  // Externe Eltern sitzen eine Generation über ihrem frühesten Kind.
  for (const node of nodes.filter((n) => n.external)) {
    const childGens = nodes
      .filter((c) => !c.external && (c.mother_dog_id === node.id || c.father_dog_id === node.id))
      .map((c) => generation.get(c.id))
    generation.set(node.id, Math.min(...childGens) - 1)
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

// Liefert Zeilen (je Generation) in einer Reihenfolge mit möglichst wenig Kreuzungen.
export function layoutPedigree(nodes) {
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
