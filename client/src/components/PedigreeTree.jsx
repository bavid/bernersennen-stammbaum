import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import DogCard from './DogCard.jsx'
import { adoptiveAnchors, collectNodes, computeUnions, generationDates, housematePairs, layoutPedigree } from '../lib/pedigree.js'
import { adoptiveTitle, displayName } from '../lib/timeline.js'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
const HOUSE_PATH = 'M-6,1 L0,-5 L6,1 M-4,-0.5 L-4,5 L4,5 L4,-0.5'
const ADJACENT_GAP = 70 // bis zu diesem Abstand gelten zwei Karten als Nachbarn
const ARC_DEPTH = 30

function measure(container, cardRefs) {
  const origin = container.getBoundingClientRect()
  const boxes = new Map()
  for (const [id, element] of cardRefs.current) {
    if (!element) continue
    const rect = element.getBoundingClientRect()
    boxes.set(id, {
      left: rect.left - origin.left,
      right: rect.right - origin.left,
      cx: rect.left - origin.left + rect.width / 2,
      cy: rect.top - origin.top + rect.height / 2,
      top: rect.top - origin.top,
      bottom: rect.bottom - origin.top
    })
  }
  return { boxes, width: container.scrollWidth, height: container.scrollHeight }
}

// Eltern -> Knotenpunkt -> Kinder, als weiche Kurven.
function unionPaths(union, boxes) {
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

// "Lebt zusammen mit": gestrichelte Linie zwischen zwei Karten, Haus-Symbol in der Mitte
function housematePath(a, b) {
  if (Math.abs(a.cy - b.cy) < 12) {
    const [left, right] = a.cx < b.cx ? [a, b] : [b, a]
    // Direkte Nachbarn: kurze Linie zwischen den Karten
    if (right.left - left.right < ADJACENT_GAP) {
      const y = left.cy
      return { d: `M${left.right},${y} L${right.left},${y}`, mid: { x: (left.right + right.left) / 2, y } }
    }
    // Weiter auseinander: Bogen unter den Karten, damit die Linie nicht hinter anderen Karten verschwindet
    const bottom = Math.max(left.bottom, right.bottom)
    const depth = bottom + ARC_DEPTH
    return {
      d: `M${left.cx},${left.bottom} C${left.cx},${depth} ${right.cx},${depth} ${right.cx},${right.bottom}`,
      mid: { x: (left.cx + right.cx) / 2, y: bottom + ARC_DEPTH * 0.75 }
    }
  }
  const [upper, lower] = a.cy < b.cy ? [a, b] : [b, a]
  const midY = (upper.bottom + lower.top) / 2
  return {
    d: `M${upper.cx},${upper.bottom} C${upper.cx},${midY} ${lower.cx},${midY} ${lower.cx},${lower.top}`,
    mid: { x: (upper.cx + lower.cx) / 2, y: midY }
  }
}

export default function PedigreeTree({ dogs, allDogs, links = [] }) {
  const nodes = useMemo(() => collectNodes(dogs, allDogs), [dogs, allDogs])
  const rows = useMemo(() => layoutPedigree(nodes, links), [nodes, links])
  const unions = useMemo(() => computeUnions(nodes), [nodes])
  const pairs = useMemo(() => housematePairs(links, nodes), [links, nodes])
  const adoptiveLabels = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const labels = new Map()
    for (const [id, anchorId] of adoptiveAnchors(nodes, links)) {
      labels.set(id, `${adoptiveTitle(byId.get(id))} von ${displayName(byId.get(anchorId))}`)
    }
    return labels
  }, [nodes, links])

  const scrollRef = useRef(null)
  const containerRef = useRef(null)
  const cardRefs = useRef(new Map())
  const [geometry, setGeometry] = useState(null)
  const [hoveredId, setHoveredId] = useState(null)

  const remeasure = useCallback(() => {
    if (containerRef.current) setGeometry(measure(containerRef.current, cardRefs))
  }, [])

  // Ist der Baum breiter als der Bildschirm, mittig starten statt links abgeschnitten
  useLayoutEffect(() => {
    const scroller = scrollRef.current
    scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2
  }, [rows])

  useLayoutEffect(() => {
    remeasure()
    const observer = new ResizeObserver(remeasure)
    observer.observe(containerRef.current)
    document.fonts?.ready.then(remeasure)
    return () => observer.disconnect()
  }, [rows, remeasure])

  const related = useMemo(() => {
    if (!hoveredId) return null
    const ids = new Set([hoveredId])
    for (const union of unions) {
      if (union.parents.includes(hoveredId) || union.children.includes(hoveredId)) {
        union.parents.forEach((id) => ids.add(id))
        union.children.forEach((id) => ids.add(id))
      }
    }
    for (const [a, b] of pairs) {
      if (a === hoveredId) ids.add(b)
      if (b === hoveredId) ids.add(a)
    }
    return ids
  }, [hoveredId, unions, pairs])

  const setCardRef = (id) => (element) => {
    if (element) cardRefs.current.set(id, element)
    else cardRefs.current.delete(id)
  }

  return (
    <div className="pedigree-wrap">
      <div className="pedigree-scroll" ref={scrollRef}>
        <div className="pedigree" ref={containerRef}>
          {geometry && (
            <svg className="pedigree-lines" width={geometry.width} height={geometry.height} aria-hidden="true">
              {unions.map((union) => {
                const drawn = unionPaths(union, geometry.boxes)
                if (!drawn) return null
                const active = related && [...union.parents, ...union.children].includes(hoveredId)
                return (
                  <g key={union.key} className={active ? 'is-active' : related ? 'is-muted' : ''}>
                    {drawn.paths.map((d, i) => (
                      <path key={i} d={d} />
                    ))}
                    <circle cx={drawn.joint.x} cy={drawn.joint.y} r="4.5" />
                  </g>
                )
              })}
              {pairs.map(([a, b]) => {
                const boxA = geometry.boxes.get(a)
                const boxB = geometry.boxes.get(b)
                if (!boxA || !boxB) return null
                const { d, mid } = housematePath(boxA, boxB)
                const active = related && (a === hoveredId || b === hoveredId)
                return (
                  <g key={`${a}-${b}`} className={`housemate ${active ? 'is-active' : related ? 'is-muted' : ''}`}>
                    <path d={d} />
                    <g transform={`translate(${mid.x}, ${mid.y})`}>
                      <circle r="10" />
                      <path className="housemate-icon" d={HOUSE_PATH} />
                    </g>
                  </g>
                )
              })}
            </svg>
          )}

          {rows.map((row, index) => {
            const born = generationDates(row)
            return (
              <section className="pedigree-row" key={index} aria-label={`Generation ${index + 1}`}>
                <div className="pedigree-gen" aria-hidden="true">
                  <span className="pedigree-gen-num">{ROMAN[index] || index + 1}</span>
                  <span className="pedigree-gen-label">Generation</span>
                  {born && <span className="pedigree-gen-date">{born}</span>}
                </div>
                <div className="pedigree-cards">
                  {row.map((dog) => (
                    <DogCard
                      key={dog.id}
                      ref={setCardRef(dog.id)}
                      dog={dog}
                      adoptiveLabel={adoptiveLabels.get(dog.id)}
                      highlighted={related?.has(dog.id)}
                      dimmed={related && !related.has(dog.id)}
                      onHover={setHoveredId}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>
      {pairs.length > 0 && (
        <p className="pedigree-legend">
          <span className="legend-item">
            <span className="legend-line legend-family" /> Abstammung
          </span>
          <span className="legend-item">
            <span className="legend-line legend-housemate" /> lebt zusammen (z. B. Adoptiv-Geschwister)
          </span>
        </p>
      )}
    </div>
  )
}
