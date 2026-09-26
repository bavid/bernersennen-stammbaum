import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import DogCard from './DogCard.jsx'
import { collectNodes, computeUnions, generationDates, layoutPedigree } from '../lib/pedigree.js'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

function measure(container, cardRefs) {
  const origin = container.getBoundingClientRect()
  const boxes = new Map()
  for (const [id, element] of cardRefs.current) {
    if (!element) continue
    const rect = element.getBoundingClientRect()
    boxes.set(id, {
      cx: rect.left - origin.left + rect.width / 2,
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

export default function PedigreeTree({ dogs, allDogs }) {
  const nodes = useMemo(() => collectNodes(dogs, allDogs), [dogs, allDogs])
  const rows = useMemo(() => layoutPedigree(nodes), [nodes])
  const unions = useMemo(() => computeUnions(nodes), [nodes])

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
    return ids
  }, [hoveredId, unions])

  const setCardRef = (id) => (element) => {
    if (element) cardRefs.current.set(id, element)
    else cardRefs.current.delete(id)
  }

  return (
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
  )
}
