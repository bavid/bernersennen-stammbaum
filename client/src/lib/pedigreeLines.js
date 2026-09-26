// Linien des Stammbaums als SVG-Pfade – in den unskalierten Koordinaten des Baums.

export const RAIL_DROP = 18 // so weit hängt die "lebt zusammen"-Klammer unter den Karten
const CORNER = 8

// Eltern -> Knotenpunkt -> Kinder, als weiche Kurven
export function unionPaths(union, boxes) {
  const parents = union.parents.map((id) => boxes.get(id)).filter(Boolean)
  const children = union.children.map((id) => boxes.get(id)).filter(Boolean)
  if (!parents.length || !children.length) return null

  const parentBottom = Math.max(...parents.map((p) => p.bottom))
  const childTop = Math.min(...children.map((c) => c.top))
  const joint = {
    x: parents.reduce((sum, p) => sum + p.cx, 0) / parents.length,
    y: parentBottom + (childTop - parentBottom) * 0.45
  }
  const curve = (x1, y1, x2, y2) => {
    const midY = (y1 + y2) / 2
    return `M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`
  }
  return {
    joint,
    paths: [
      ...parents.map((p) => curve(p.cx, p.bottom, joint.x, joint.y)),
      ...children.map((c) => curve(joint.x, joint.y, c.cx, c.top))
    ]
  }
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
