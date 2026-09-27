import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import DogCard from './DogCard.jsx'
import Icon from './Icon.jsx'
import PedigreeToolbar from './PedigreeToolbar.jsx'
import usePanZoom from '../hooks/usePanZoom.js'
import {
  adoptiveAnchors,
  collectNodes,
  computeUnions,
  generationDates,
  housemateGroups,
  housematePairs,
  layoutPedigree
} from '../lib/pedigree.js'
import { crossRowPath, householdPath, unionPaths } from '../lib/pedigreeLines.js'
import { adoptiveTitle, displayName } from '../lib/timeline.js'
import { fitZoom, zoomIn, zoomOut } from '../lib/zoom.js'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
const HOUSE_PATH = 'M-6,1 L0,-5 L6,1 M-4,-0.5 L-4,5 L4,5 L4,-0.5'
const PHONE_QUERY = '(max-width: 720px)' // wie der Handy-Umbruch in tree.css

// Position einer Karte im Baum, unabhängig vom Zoom (offset* ignoriert transform)
function offsetBox(element, container) {
  let left = 0
  let top = 0
  let node = element
  while (node && node !== container) {
    left += node.offsetLeft
    top += node.offsetTop
    node = node.offsetParent
  }
  if (node !== container) return null
  const { offsetWidth: width, offsetHeight: height } = element
  return { left, right: left + width, top, bottom: top + height, cx: left + width / 2, cy: top + height / 2 }
}

function measure(container, cardRefs) {
  const boxes = new Map()
  for (const [id, element] of cardRefs.current) {
    const box = element && offsetBox(element, container)
    if (box) boxes.set(id, box)
  }
  return { boxes, width: container.offsetWidth, height: container.offsetHeight }
}

// Innenfläche des Rahmens ohne Innenabstand
function innerSize(scroller) {
  const style = getComputedStyle(scroller)
  const pad = (a, b) => (parseFloat(style[a]) || 0) + (parseFloat(style[b]) || 0)
  return {
    width: scroller.clientWidth - pad('paddingLeft', 'paddingRight'),
    height: scroller.clientHeight - pad('paddingTop', 'paddingBottom')
  }
}

function HouseMarker({ x, y, onToggle }) {
  return (
    <g
      transform={`translate(${x}, ${y})`}
      className={onToggle ? 'housemate-toggle' : undefined}
      onClick={onToggle}
      role={onToggle ? 'button' : undefined}
      tabIndex={onToggle ? 0 : undefined}
      aria-label={onToggle ? 'Mitbewohner einklappen' : undefined}
      onKeyDown={
        onToggle &&
        ((event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          onToggle()
        })
      }
    >
      <circle r="10" />
      <path className="housemate-icon" d={HOUSE_PATH} />
    </g>
  )
}

// Eingeklappter Mitbewohner: kleines Haus-Symbol direkt am Haupttier statt der vollen Karte(n)
function HousemateBadge({ count, onClick }) {
  return (
    <button type="button" className="housemate-badge" onClick={onClick} title="Mitbewohner anzeigen">
      <svg viewBox="-10 -10 20 20" width="20" height="20" aria-hidden="true">
        <circle r="10" />
        <path className="housemate-icon" d={HOUSE_PATH} />
      </svg>
      {count > 1 && <span className="housemate-badge-count">{count}</span>}
    </button>
  )
}

export default function PedigreeTree({ dogs, allDogs, links = [] }) {
  const nodes = useMemo(() => collectNodes(dogs, allDogs), [dogs, allDogs])
  const rows = useMemo(() => layoutPedigree(nodes, links), [nodes, links])
  const unions = useMemo(() => computeUnions(nodes), [nodes])
  const pairs = useMemo(() => housematePairs(links, nodes), [links, nodes])
  const groups = useMemo(() => {
    const rowOf = new Map(rows.flatMap((row, index) => row.map((dog) => [dog.id, index])))
    return housemateGroups(pairs, rowOf)
  }, [pairs, rows])
  const anchors = useMemo(() => adoptiveAnchors(nodes, links), [nodes, links])
  const adoptiveLabels = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const labels = new Map()
    for (const [id, anchorId] of anchors) {
      labels.set(id, `${adoptiveTitle(byId.get(id))} von ${displayName(byId.get(anchorId))}`)
    }
    return labels
  }, [nodes, anchors])

  // Mitbewohner sind standardmäßig eingeklappt: nur ein Haus-Symbol am Haupttier, bis man draufklickt
  const [expandedAnchors, setExpandedAnchors] = useState(() => new Set())
  const hiddenByAnchor = useMemo(() => {
    const map = new Map()
    for (const [id, anchorId] of anchors) {
      if (expandedAnchors.has(anchorId)) continue
      if (!map.has(anchorId)) map.set(anchorId, [])
      map.get(anchorId).push(id)
    }
    return map
  }, [anchors, expandedAnchors])
  const hiddenHousemateIds = useMemo(() => new Set([...hiddenByAnchor.values()].flat()), [hiddenByAnchor])
  const expandAnchor = (anchorId) => setExpandedAnchors((prev) => new Set(prev).add(anchorId))
  const collapseAnchor = (anchorId) =>
    setExpandedAnchors((prev) => {
      const next = new Set(prev)
      next.delete(anchorId)
      return next
    })

  // Jede Generation lässt sich einzeln einklappen, um lange Bäume schlanker zu machen
  const [collapsedGens, setCollapsedGens] = useState(() => new Set())
  const toggleGen = (index) =>
    setCollapsedGens((prev) => {
      const next = new Set(prev)
      next.has(index) ? next.delete(index) : next.add(index)
      return next
    })

  const scrollRef = useRef(null)
  const containerRef = useRef(null)
  const cardRefs = useRef(new Map())
  const initialScrollPending = useRef(true)
  const zoomBeforeExpand = useRef(null)
  const [geometry, setGeometry] = useState(null)
  const [availableWidth, setAvailableWidth] = useState(0)
  const [hoveredId, setHoveredId] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const { zoom, zoomTo, syncLabels } = usePanZoom(scrollRef, containerRef)

  const remeasure = useCallback(() => {
    if (containerRef.current) setGeometry(measure(containerRef.current, cardRefs))
  }, [])

  useLayoutEffect(() => {
    initialScrollPending.current = true
    remeasure()
    const observer = new ResizeObserver(remeasure)
    observer.observe(containerRef.current)
    document.fonts?.ready.then(remeasure)
    return () => observer.disconnect()
  }, [rows, remeasure])

  // Ein-/ausklappen ändert, welche Karten es überhaupt gibt – sofort neu vermessen,
  // statt auf den ResizeObserver zu warten (sonst zeigen die Linien kurz auf verschwundene Karten)
  useLayoutEffect(() => {
    remeasure()
  }, [collapsedGens, expandedAnchors, remeasure])

  // Breite Bäume: am Handy mittig starten (Generationen stehen über den Karten), am Desktop links
  useLayoutEffect(() => {
    if (!geometry || !initialScrollPending.current) return
    initialScrollPending.current = false
    const scroller = scrollRef.current
    const centered = window.matchMedia?.(PHONE_QUERY).matches
    scroller.scrollLeft = centered ? (scroller.scrollWidth - scroller.clientWidth) / 2 : 0
    syncLabels()
  }, [geometry, syncLabels])

  // Schmale Bäume bleiben mittig: die Ebene ist mindestens so breit wie der sichtbare Rahmen
  useLayoutEffect(() => {
    const scroller = scrollRef.current
    const update = () => setAvailableWidth(innerSize(scroller).width)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [])

  const fit = useCallback(() => {
    const layer = containerRef.current
    const previous = layer.style.minWidth
    layer.style.minWidth = '0px' // eigentliche Breite des Baums, ohne Mindestbreite
    const content = { width: layer.offsetWidth, height: layer.offsetHeight }
    layer.style.minWidth = previous
    const available = innerSize(scrollRef.current)
    zoomTo(fitZoom(content, expanded ? available : { width: available.width }))
  }, [expanded, zoomTo])

  const collapse = useCallback(() => {
    setExpanded(false)
    if (zoomBeforeExpand.current !== null) zoomTo(zoomBeforeExpand.current)
    zoomBeforeExpand.current = null
  }, [zoomTo])

  function toggleExpanded() {
    if (expanded) {
      collapse()
      return
    }
    zoomBeforeExpand.current = zoom
    setExpanded(true)
  }

  // Vollbild öffnet passend eingezoomt – nur beim Öffnen, nicht bei jeder Größenänderung
  const fitRef = useRef(fit)
  fitRef.current = fit
  useLayoutEffect(() => {
    if (expanded) fitRef.current()
  }, [expanded])

  // Im Vollbild scrollt die Seite dahinter nicht, Escape schließt
  useEffect(() => {
    if (!expanded) return undefined
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    const onKey = (event) => event.key === 'Escape' && collapse()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', onKey)
    }
  }, [expanded, collapse])

  const related = useMemo(() => {
    if (!hoveredId) return null
    const ids = new Set([hoveredId])
    for (const union of unions) {
      if (union.parents.includes(hoveredId) || union.children.includes(hoveredId)) {
        union.parents.forEach((id) => ids.add(id))
        union.children.forEach((id) => ids.add(id))
      }
    }
    for (const members of groups.households) {
      if (members.includes(hoveredId)) members.forEach((id) => ids.add(id))
    }
    for (const [a, b] of groups.crossRow) {
      if (a === hoveredId) ids.add(b)
      if (b === hoveredId) ids.add(a)
    }
    return ids
  }, [hoveredId, unions, groups])

  const setCardRef = (id) => (element) => {
    if (element) cardRefs.current.set(id, element)
    else cardRefs.current.delete(id)
  }

  const lineState = (ids) => (related ? (ids.includes(hoveredId) ? 'is-active' : 'is-muted') : '')
  const hasHousemates = groups.households.length > 0 || groups.crossRow.length > 0

  return (
    <div className={`pedigree-wrap ${expanded ? 'is-expanded' : ''}`}>
      <PedigreeToolbar
        zoom={zoom}
        expanded={expanded}
        onZoomIn={() => zoomTo(zoomIn(zoom))}
        onZoomOut={() => zoomTo(zoomOut(zoom))}
        onReset={() => zoomTo(1)}
        onFit={fit}
        onToggleExpand={toggleExpanded}
      />
      <div className="pedigree-scroll" ref={scrollRef}>
        <div
          className="pedigree-sizer"
          style={geometry ? { width: geometry.width * zoom, height: geometry.height * zoom } : undefined}
        >
          <div
            className={`pedigree ${hasHousemates ? 'has-housemates' : ''}`}
            ref={containerRef}
            style={{ transform: `scale(${zoom})`, minWidth: availableWidth ? availableWidth / zoom : undefined }}
          >
            {geometry && (
              <svg className="pedigree-lines" width={geometry.width} height={geometry.height} aria-hidden="true">
                {unions.map((union) => {
                  const drawn = unionPaths(union, geometry.boxes)
                  if (!drawn) return null
                  return (
                    <g key={union.key} className={lineState([...union.parents, ...union.children])}>
                      {drawn.paths.map((d, i) => (
                        <path key={i} d={d} />
                      ))}
                      <circle cx={drawn.joint.x} cy={drawn.joint.y} r="4.5" />
                    </g>
                  )
                })}
                {groups.households.map((members) => {
                  const boxes = members.map((id) => geometry.boxes.get(id)).filter(Boolean)
                  if (boxes.length < 2) return null
                  const { d, icon } = householdPath(boxes)
                  const anchorId = members.find((id) => !anchors.has(id))
                  return (
                    <g key={members.join('-')} className={`housemate ${lineState(members)}`} data-members={members.length}>
                      <path d={d} />
                      <HouseMarker {...icon} onToggle={anchorId !== undefined ? () => collapseAnchor(anchorId) : undefined} />
                    </g>
                  )
                })}
                {groups.crossRow.map(([a, b]) => {
                  const boxA = geometry.boxes.get(a)
                  const boxB = geometry.boxes.get(b)
                  if (!boxA || !boxB) return null
                  const { d, icon } = crossRowPath(boxA, boxB)
                  return (
                    <g key={`${a}-${b}`} className={`housemate ${lineState([a, b])}`} data-members="2">
                      <path d={d} />
                      <HouseMarker {...icon} />
                    </g>
                  )
                })}
              </svg>
            )}

            {rows.map((row, index) => {
              const born = generationDates(row)
              const isCollapsed = collapsedGens.has(index)
              return (
                <section className="pedigree-row" key={index} aria-label={`Generation ${index + 1}`}>
                  <button
                    type="button"
                    className="pedigree-gen"
                    onClick={() => toggleGen(index)}
                    aria-expanded={!isCollapsed}
                  >
                    <span className="pedigree-gen-num">{ROMAN[index] || index + 1}</span>
                    <span className="pedigree-gen-label">Generation</span>
                    {born && <span className="pedigree-gen-date">{born}</span>}
                    <Icon name="chevronDown" className={`pedigree-gen-chevron ${isCollapsed ? 'is-collapsed' : ''}`} />
                  </button>
                  <div className="pedigree-cards">
                    {isCollapsed ? (
                      <button type="button" className="pedigree-collapsed-hint" onClick={() => toggleGen(index)}>
                        {row.length} {row.length === 1 ? 'Tier' : 'Tiere'} · einblenden
                      </button>
                    ) : (
                      row.flatMap((dog) => {
                        if (hiddenHousemateIds.has(dog.id)) return []
                        const card = (
                          <DogCard
                            key={dog.id}
                            ref={setCardRef(dog.id)}
                            dog={dog}
                            adoptiveLabel={adoptiveLabels.get(dog.id)}
                            highlighted={related?.has(dog.id)}
                            dimmed={related && !related.has(dog.id)}
                            onHover={setHoveredId}
                          />
                        )
                        const hidden = hiddenByAnchor.get(dog.id)
                        if (!hidden?.length) return [card]
                        return [card, <HousemateBadge key={`house-${dog.id}`} count={hidden.length} onClick={() => expandAnchor(dog.id)} />]
                      })
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      </div>
      {hasHousemates && (
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
