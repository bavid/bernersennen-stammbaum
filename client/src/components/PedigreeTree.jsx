import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import HousemateLane from './HousemateLane.jsx'
import PedigreeRow from './PedigreeRow.jsx'
import PedigreeToolbar from './PedigreeToolbar.jsx'
import { HOUSE_PATH } from './HouseGlyph.jsx'
import usePanZoom from '../hooks/usePanZoom.js'
import {
  collectNodes,
  computeUnions,
  generationDates,
  housemateAnchors,
  housemateGroups,
  housemateLanes,
  housematePairs,
  layoutPedigree
} from '../lib/pedigree.js'
import { crossRowPath, householdPath, laneConnector, placeLaneGroups, unionPaths } from '../lib/pedigreeLines.js'
import { readSetting, writeSetting } from '../lib/storage.js'
import { livesWithLabel } from '../lib/timeline.js'
import { fitZoom, zoomIn, zoomOut } from '../lib/zoom.js'

const PHONE_QUERY = '(max-width: 720px)' // wie der Handy-Umbruch in tree.css
const LANE_GAP = 16
const FLOOR_MARGIN = 14 // Abstand der Eltern-Linien unter einer Mitbewohner-Reihe

// Position eines Elements im Baum, unabhängig vom Zoom (offset* ignoriert transform)
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

function measureAll(refs, container) {
  const boxes = new Map()
  for (const [key, element] of refs.current) {
    const box = element && offsetBox(element, container)
    if (box) boxes.set(key, box)
  }
  return boxes
}

function measure(container, refs) {
  return {
    boxes: measureAll(refs.cards, container),
    toggles: measureAll(refs.toggles, container),
    tracks: measureAll(refs.tracks, container),
    groupWidths: new Map([...refs.groups.current].filter(([, el]) => el).map(([id, el]) => [id, el.offsetWidth])),
    width: container.offsetWidth,
    height: container.offsetHeight
  }
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

function HouseMarker({ x, y }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle r="10" />
      <path className="housemate-icon" d={HOUSE_PATH} />
    </g>
  )
}

// Ansichts-Einstellung pro Gerät (z. B. welche Mitbewohner aufgeklappt sind)
function useStoredSet(key) {
  const [value, setValue] = useState(() => {
    const stored = readSetting(key, [])
    return new Set(Array.isArray(stored) ? stored : [])
  })
  useEffect(() => writeSetting(key, [...value]), [key, value])
  const update = useCallback((change) => setValue((previous) => change(new Set(previous))), [])
  return [value, update]
}

const toggleIn = (id) => (set) => {
  if (set.has(id)) set.delete(id)
  else set.add(id)
  return set
}

// Elemente je Schlüssel merken; die Ref-Callbacks bleiben pro Schlüssel stabil (kein Neu-Anhängen bei jedem Hover)
function useRefMap() {
  const map = useRef(new Map())
  const callbacks = useRef(new Map())
  const setter = useCallback((key) => {
    if (!callbacks.current.has(key)) {
      callbacks.current.set(key, (element) => {
        if (element) map.current.set(key, element)
        else map.current.delete(key)
      })
    }
    return callbacks.current.get(key)
  }, [])
  return [map, setter]
}

export default function PedigreeTree({ dogs, allDogs, links = [], onAddMitbewohner }) {
  const nodes = useMemo(() => collectNodes(dogs, allDogs), [dogs, allDogs])
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const anchors = useMemo(() => housemateAnchors(nodes, links), [nodes, links])
  const rows = useMemo(() => layoutPedigree(nodes, links), [nodes, links])
  const lanes = useMemo(() => housemateLanes(rows, anchors), [rows, anchors])
  const unions = useMemo(() => computeUnions(nodes), [nodes])
  const parentIds = useMemo(() => new Set(unions.flatMap((u) => u.parents)), [unions])
  // Mitbewohner-Tiere liegen "zwischen" den Generationen (x.5). Sie haben per Definition keine Abstammung,
  // sind also nie Eltern einer Linie – laneFloor sieht darum nur ganze Reihen.
  const rowOf = useMemo(() => {
    const map = new Map(rows.flatMap((row, index) => row.map((dog) => [dog.id, index])))
    for (const [id, anchorId] of anchors) map.set(id, map.get(anchorId) + 0.5)
    return map
  }, [rows, anchors])
  // Mitbewohner ohne Abstammung ↔ Haupttier zeigt die Mitbewohner-Reihe; alle anderen Paare als Klammer bzw. Kurve
  const groups = useMemo(() => {
    const viaLane = ([a, b]) =>
      anchors.get(a) === b || anchors.get(b) === a || (anchors.has(a) && anchors.get(a) === anchors.get(b))
    return housemateGroups(housematePairs(links, nodes).filter((pair) => !viaLane(pair)), rowOf)
  }, [links, nodes, anchors, rowOf])
  const housemateLabels = useMemo(() => {
    const labels = new Map()
    for (const [id, anchorId] of anchors) {
      labels.set(id, livesWithLabel([byId.get(anchorId)]))
    }
    return labels
  }, [byId, anchors])

  // Mitbewohner sind eingeklappt, bis man am Haupttier aufs Haus klickt; Generationen lassen sich kompakt zeigen
  const [openHousemates, updateOpenHousemates] = useStoredSet('openHousemates')
  const [compactGens, updateCompactGens] = useStoredSet('compactGens')

  const visibleLanes = useMemo(
    () =>
      lanes.map((laneGroups, index) =>
        compactGens.has(index)
          ? []
          : laneGroups
              .filter((group) => openHousemates.has(group.anchorId))
              .map((group) => ({
                ...group,
                members: group.memberIds.map((id) => byId.get(id)),
                anchor: byId.get(group.anchorId)
              }))
      ),
    [lanes, compactGens, openHousemates, byId]
  )

  const scrollRef = useRef(null)
  const containerRef = useRef(null)
  const [cardRefs, setCardRef] = useRefMap()
  const [toggleRefs, setToggleRef] = useRefMap()
  const [trackRefs, setTrackRef] = useRefMap()
  const [groupRefs, setGroupRef] = useRefMap()
  const initialScrollPending = useRef(true)
  const zoomBeforeExpand = useRef(null)
  const [geometry, setGeometry] = useState(null)
  const [hoveredId, setHoveredId] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const { zoom, zoomTo, syncLabels } = usePanZoom(scrollRef, containerRef)

  const remeasure = useCallback(() => {
    if (!containerRef.current) return
    setGeometry(measure(containerRef.current, { cards: cardRefs, toggles: toggleRefs, tracks: trackRefs, groups: groupRefs }))
  }, [cardRefs, toggleRefs, trackRefs, groupRefs])

  useLayoutEffect(() => {
    initialScrollPending.current = true
    remeasure()
    const observer = new ResizeObserver(remeasure)
    observer.observe(containerRef.current)
    document.fonts?.ready.then(remeasure)
    return () => observer.disconnect()
  }, [rows, remeasure])

  // Mitbewohner-Gruppen unter ihr Haupttier setzen – gemessen am Haus-Knopf, an dem die Linie beginnt
  const placements = useMemo(() => {
    if (!geometry) return []
    return visibleLanes.map((laneGroups, index) => {
      const track = geometry.tracks.get(index)
      if (!laneGroups.length || !track) return null
      const branchPoints = new Map(
        laneGroups.map((group) => {
          const box = geometry.boxes.get(group.anchorId)
          const toggle = geometry.toggles.get(group.anchorId)
          return [group.anchorId, box && toggle ? { ...box, cx: toggle.cx } : box]
        })
      )
      const stems = rows[index]
        .filter((dog) => parentIds.has(dog.id))
        .map((dog) => geometry.boxes.get(dog.id)?.cx)
        .filter((x) => x !== undefined)
      return placeLaneGroups(laneGroups, {
        anchors: branchPoints,
        widths: geometry.groupWidths,
        stems,
        minX: track.left + LANE_GAP,
        maxX: geometry.width,
        gap: LANE_GAP
      })
    })
  }, [geometry, visibleLanes, rows, parentIds])

  // Nach dem Aufklappen, Einklappen oder Verschieben neu vermessen (die Linien hängen an den Karten)
  const placementKey = JSON.stringify(placements.map((placement) => placement && [...placement.entries()]))
  useLayoutEffect(() => {
    remeasure()
  }, [placementKey, compactGens, openHousemates, remeasure])

  // Breite Bäume: am Handy mittig starten (Generationen stehen über den Karten), am Desktop links
  useLayoutEffect(() => {
    if (!geometry || !initialScrollPending.current) return
    initialScrollPending.current = false
    const scroller = scrollRef.current
    const centered = window.matchMedia?.(PHONE_QUERY).matches
    scroller.scrollLeft = centered ? (scroller.scrollWidth - scroller.clientWidth) / 2 : 0
    syncLabels()
  }, [geometry, syncLabels])

  const fit = useCallback(() => {
    const layer = containerRef.current
    const available = innerSize(scrollRef.current)
    const content = { width: layer.offsetWidth, height: layer.offsetHeight }
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

  // "Vorfahren kompakt": alle Generationen bis auf die jüngste auf Porträt + Name reduzieren
  const anyCompact = compactGens.size > 0
  const toggleAncestorsCompact = () =>
    updateCompactGens(() => (anyCompact ? new Set() : new Set(rows.slice(0, -1).map((_, index) => index))))

  const related = useMemo(() => {
    if (!hoveredId) return null
    const ids = new Set([hoveredId])
    for (const union of unions) {
      if (union.parents.includes(hoveredId) || union.children.includes(hoveredId)) {
        union.parents.forEach((id) => ids.add(id))
        union.children.forEach((id) => ids.add(id))
      }
    }
    const anchorId = anchors.get(hoveredId) ?? hoveredId
    for (const [id, anchor] of anchors) {
      if (anchor === anchorId) ids.add(id).add(anchorId)
    }
    for (const members of groups.households) {
      if (members.includes(hoveredId)) members.forEach((id) => ids.add(id))
    }
    for (const [a, b] of groups.crossRow) {
      if (a === hoveredId) ids.add(b)
      if (b === hoveredId) ids.add(a)
    }
    return ids
  }, [hoveredId, unions, anchors, groups])

  const lineState = (ids) => (related ? (ids.includes(hoveredId) ? 'is-active' : 'is-muted') : '')
  const cardProps = (dog) => ({
    livesWithLabel: housemateLabels.get(dog.id),
    highlighted: related?.has(dog.id),
    dimmed: related && !related.has(dog.id),
    onHover: setHoveredId
  })
  const housematesOfRow = (index) =>
    new Map(
      lanes[index].map((group) => [
        group.anchorId,
        {
          count: group.memberIds.length,
          open: openHousemates.has(group.anchorId),
          onToggle: () => updateOpenHousemates(toggleIn(group.anchorId))
        }
      ])
    )
  const laneFloor = (rowIndex) => {
    const bottoms = (visibleLanes[rowIndex] || [])
      .flatMap((group) => group.memberIds)
      .map((id) => geometry.boxes.get(id)?.bottom)
      .filter((bottom) => bottom !== undefined)
    return bottoms.length ? Math.max(...bottoms) + FLOOR_MARGIN : undefined
  }
  const hasHousemates = anchors.size > 0 || groups.households.length > 0 || groups.crossRow.length > 0

  return (
    <div className={`pedigree-wrap ${expanded ? 'is-expanded' : ''}`}>
      <PedigreeToolbar
        zoom={zoom}
        expanded={expanded}
        compact={anyCompact}
        canCompact={rows.length > 1}
        onZoomIn={() => zoomTo(zoomIn(zoom))}
        onZoomOut={() => zoomTo(zoomOut(zoom))}
        onReset={() => zoomTo(1)}
        onFit={fit}
        onToggleCompact={toggleAncestorsCompact}
        onToggleExpand={toggleExpanded}
      />
      <div className="pedigree-scroll" ref={scrollRef}>
        <div className="pedigree-sizer" style={geometry ? { width: geometry.width * zoom, height: geometry.height * zoom } : undefined}>
          <div
            className={`pedigree ${groups.households.length ? 'has-households' : ''}`}
            ref={containerRef}
            style={{ transform: `scale(${zoom})` }}
          >
            {geometry && (
              <svg className="pedigree-lines" width={geometry.width} height={geometry.height} aria-hidden="true">
                {unions.map((union) => {
                  const drawn = unionPaths(union, geometry.boxes, { floor: laneFloor(rowOf.get(union.parents[0])) })
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
                {visibleLanes.flatMap((laneGroups, index) =>
                  laneGroups.map((group) => {
                    const toggle = geometry.toggles.get(group.anchorId)
                    const spot = placements[index]?.get(group.anchorId)
                    const members = group.memberIds.map((id) => geometry.boxes.get(id)).filter(Boolean)
                    if (!toggle || !spot || !members.length) return null
                    const { d } = laneConnector({ bottom: toggle.bottom }, spot.stemX, members)
                    return (
                      <g
                        key={`lane-${group.anchorId}`}
                        className={`housemate lane-link ${lineState([group.anchorId, ...group.memberIds])}`}
                        data-members={group.memberIds.length + 1}
                      >
                        <path d={d} />
                      </g>
                    )
                  })
                )}
                {groups.households.map((members) => {
                  const boxes = members.map((id) => geometry.boxes.get(id)).filter(Boolean)
                  if (boxes.length < 2) return null
                  const { d, icon } = householdPath(boxes)
                  return (
                    <g key={members.join('-')} className={`housemate ${lineState(members)}`} data-members={members.length}>
                      <path d={d} />
                      <HouseMarker {...icon} />
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

            {rows.flatMap((row, index) => {
              const rowElement = (
                <PedigreeRow
                  key={`row-${index}`}
                  index={index}
                  row={row}
                  born={generationDates(row)}
                  compact={compactGens.has(index)}
                  onToggleCompact={() => updateCompactGens(toggleIn(index))}
                  cardProps={cardProps}
                  setCardRef={setCardRef}
                  housemates={housematesOfRow(index)}
                  setToggleRef={setToggleRef}
                />
              )
              if (!visibleLanes[index].length) return [rowElement]
              return [
                rowElement,
                <HousemateLane
                  key={`lane-${index}`}
                  index={index}
                  groups={visibleLanes[index]}
                  placement={placements[index]}
                  trackLeft={geometry?.tracks.get(index)?.left}
                  trackRef={setTrackRef(index)}
                  setGroupRef={setGroupRef}
                  setCardRef={setCardRef}
                  cardProps={cardProps}
                  onAddMitbewohner={onAddMitbewohner}
                />
              ]
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
            <span className="legend-line legend-housemate" /> lebt zusammen – Haus am Tier antippen zeigt die Mitbewohner
          </span>
        </p>
      )}
    </div>
  )
}
