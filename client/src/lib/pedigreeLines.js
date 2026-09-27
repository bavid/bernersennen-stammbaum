// Linien des Stammbaums als SVG-Pfade – in den unskalierten Koordinaten des Baums.

export const RAIL_DROP = 18 // so weit hängt die "lebt zusammen"-Klammer unter den Karten
const CORNER = 8
const LANE_RAIL = 16 // Schiene über den Karten der Mitbewohner-Reihe
const STEM_CLEAR = 36 // so weit bleibt eine Mitbewohner-Gruppe von Linien zu Kindern weg
const STEM_OFFSET = 40 // Abzweig neben der Kinder-Linie, wenn das Haupttier selbst Nachwuchs hat

const curve = (x1, y1, x2, y2) => {
  const midY = (y1 + y2) / 2
  return `C${x1},${midY} ${x2},${midY} ${x2},${y2}`
}

// Eltern -> Knotenpunkt -> Kinder, als weiche Kurven. floor: Unterkante einer Mitbewohner-Reihe unter
// den Eltern – dann laufen die Linien erst senkrecht daran vorbei und der Knotenpunkt liegt darunter.
export function unionPaths(union, boxes, { floor } = {}) {
  const parents = union.parents.map((id) => boxes.get(id)).filter(Boolean)
  const children = union.children.map((id) => boxes.get(id)).filter(Boolean)
  if (!parents.length || !children.length) return null

  const parentBottom = Math.max(...parents.map((p) => p.bottom))
  const base = floor ? Math.max(parentBottom, floor) : parentBottom
  const childTop = Math.min(...children.map((c) => c.top))
  const joint = {
    x: parents.reduce((sum, p) => sum + p.cx, 0) / parents.length,
    y: base + (childTop - base) * 0.45
  }
  const fromParent = (p) =>
    floor ? `M${p.cx},${p.bottom} V${base} ${curve(p.cx, base, joint.x, joint.y)}` : `M${p.cx},${p.bottom} ${curve(p.cx, p.bottom, joint.x, joint.y)}`
  return {
    joint,
    paths: [...parents.map(fromParent), ...children.map((c) => `M${joint.x},${joint.y} ${curve(joint.x, joint.y, c.cx, c.top)}`)]
  }
}

// Mitbewohner-Gruppen in der Zwischenreihe platzieren: mittig unter dem Haupttier (wie ein aufgeklapptes
// Untermenü), ohne Überlappung, innerhalb von minX..maxX (nicht in die Generationen-Spalte, nicht über den
// rechten Rand des Baums) und neben Linien zu Kindern vorbei.
// stems: x-Positionen von Tieren dieser Reihe, von denen eine Linie zu ihren Kindern nach unten geht.
export function placeLaneGroups(groups, { anchors, widths, stems = [], minX = 0, maxX = Infinity, gap = 16 }) {
  const placed = new Map()
  let cursor = -Infinity
  for (const { anchorId } of groups) {
    const anchor = anchors.get(anchorId)
    const width = widths.get(anchorId)
    if (!anchor || !width) continue
    const hasOwnStem = stems.some((x) => Math.abs(x - anchor.cx) < 1)
    const otherStems = stems.filter((x) => Math.abs(x - anchor.cx) >= 1)
    const blocked = (x) => otherStems.some((s) => s > x - STEM_CLEAR && s < x + width + STEM_CLEAR)
    const floor = Math.max(minX, cursor + gap)
    const candidates = [
      ...(hasOwnStem ? [] : [anchor.cx - width / 2]),
      anchor.cx + STEM_CLEAR,
      anchor.cx - STEM_CLEAR - width
    ].map((x) => Math.round(Math.max(Math.min(x, maxX - width), floor)))
    const x = candidates.find((c) => !blocked(c)) ?? candidates[0]
    const side = Math.sign(x + width / 2 - anchor.cx)
    const offset = Math.min(STEM_OFFSET, (anchor.right - anchor.left) / 2 - 16)
    placed.set(anchorId, { x, width, stemX: hasOwnStem ? anchor.cx + (side || 1) * offset : anchor.cx })
    cursor = x + width
  }
  return placed
}

// Vom Haupttier senkrecht nach unten zur Schiene, von dort in jede Karte der Mitbewohner-Reihe.
// Das Haus-Symbol sitzt auf dem senkrechten Abzweig.
export function laneConnector(anchor, stemX, members) {
  const sorted = [...members].sort((a, b) => a.cx - b.cx)
  const y = Math.min(...sorted.map((m) => m.top)) - LANE_RAIL
  const left = Math.min(stemX, sorted[0].cx)
  const right = Math.max(stemX, sorted[sorted.length - 1].cx)
  const rail = right > left ? ` M${left},${y} H${right}` : ''
  const drops = sorted.map((m) => ` M${m.cx},${y} V${m.top}`).join('')
  return { d: `M${stemX},${anchor.bottom} V${y}${rail}${drops}`, icon: { x: stemX, y: (anchor.bottom + y) / 2 } }
}

// Ein Haushalt in einer Reihe: kurze Stummel unter jeder Karte, eine gemeinsame Schiene darunter,
// das Haus-Symbol auf der Schiene zwischen zwei Mitgliedern (nie direkt unter einem Stummel).
export function householdPath(members) {
  const sorted = [...members].sort((a, b) => a.cx - b.cx)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const y = Math.max(...sorted.map((m) => m.bottom)) + RAIL_DROP
  const r = Math.min(CORNER, (last.cx - first.cx) / 2)

  const bracket =
    `M${first.cx},${first.bottom} V${y - r} Q${first.cx},${y} ${first.cx + r},${y} ` +
    `H${last.cx - r} Q${last.cx},${y} ${last.cx},${y - r} V${last.bottom}`
  const stubs = sorted.slice(1, -1).map((m) => ` M${m.cx},${m.bottom} V${y}`)

  const center = (first.cx + last.cx) / 2
  const gaps = sorted.slice(1).map((m, i) => (sorted[i].cx + m.cx) / 2)
  const iconX = gaps.reduce((best, x) => (Math.abs(x - center) < Math.abs(best - center) ? x : best), gaps[0])
  return { d: bracket + stubs.join(''), icon: { x: iconX, y } }
}

// Mitbewohner in verschiedenen Generationen: weiche Kurve von unten nach oben
export function crossRowPath(a, b) {
  const [upper, lower] = a.cy < b.cy ? [a, b] : [b, a]
  const midY = (upper.bottom + lower.top) / 2
  return {
    d: `M${upper.cx},${upper.bottom} C${upper.cx},${midY} ${lower.cx},${midY} ${lower.cx},${lower.top}`,
    icon: { x: (upper.cx + lower.cx) / 2, y: midY }
  }
}
