import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { anchoredScroll, clampZoom } from '../lib/zoom.js'
import { readSetting, writeSetting } from '../lib/storage.js'

const DRAG_THRESHOLD = 4 // px, ab hier ist es Ziehen statt Klicken
const WHEEL_SPEED = 0.0015

function paddingOf(element) {
  const style = getComputedStyle(element)
  return { left: parseFloat(style.paddingLeft) || 0, top: parseFloat(style.paddingTop) || 0 }
}

// Zoomen (Knöpfe, Strg + Mausrad, Trackpad-Pinch) und Verschieben per Maus für den Stammbaum.
// scrollRef: der scrollende Rahmen, layerRef: die skalierte Ebene darin.
export default function usePanZoom(scrollRef, layerRef) {
  const [zoom, setZoomState] = useState(() => clampZoom(readSetting('treeZoom', 1)))
  const zoomRef = useRef(zoom)
  const anchorRef = useRef(null)

  // Generationen bleiben links stehen: Verschiebung in unskalierten Koordinaten der Ebene
  const syncLabels = useCallback(() => {
    const scroller = scrollRef.current
    const layer = layerRef.current
    if (!scroller || !layer) return
    layer.style.setProperty('--label-shift', `${scroller.scrollLeft / zoomRef.current}px`)
    scroller.classList.toggle('is-scrolled', scroller.scrollLeft > 2)
  }, [scrollRef, layerRef])

  // Zoomt so, dass der Punkt am Anker (Pixel im sichtbaren Rahmen) stehen bleibt; ohne Anker: Bildmitte
  const zoomTo = useCallback(
    (next, anchor) => {
      const scroller = scrollRef.current
      const target = clampZoom(next)
      if (!scroller || target === zoomRef.current) return
      anchorRef.current = {
        from: zoomRef.current,
        x: anchor?.x ?? scroller.clientWidth / 2,
        y: anchor?.y ?? scroller.clientHeight / 2,
        left: scroller.scrollLeft,
        top: scroller.scrollTop
      }
      zoomRef.current = target
      setZoomState(target)
      writeSetting('treeZoom', target)
    },
    [scrollRef]
  )

  // Nach dem Neuzeichnen (größere/kleinere Fläche) die Scroll-Position zum Anker nachführen
  useLayoutEffect(() => {
    const scroller = scrollRef.current
    const anchor = anchorRef.current
    anchorRef.current = null
    if (scroller && anchor) {
      const pad = paddingOf(scroller)
      scroller.scrollLeft = anchoredScroll({ scroll: anchor.left, anchor: anchor.x, pad: pad.left, from: anchor.from, to: zoom })
      scroller.scrollTop = anchoredScroll({ scroll: anchor.top, anchor: anchor.y, pad: pad.top, from: anchor.from, to: zoom })
    }
    syncLabels()
  }, [zoom, scrollRef, syncLabels])

  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return undefined
    let drag = null

    function onWheel(event) {
      if (!event.ctrlKey && !event.metaKey) return // normales Scrollen bleibt normales Scrollen
      event.preventDefault()
      const rect = scroller.getBoundingClientRect()
      zoomTo(zoomRef.current * Math.exp(-event.deltaY * WHEEL_SPEED), { x: event.clientX - rect.left, y: event.clientY - rect.top })
    }

    function onPointerDown(event) {
      if (event.pointerType !== 'mouse' || event.button !== 0) return // Touch scrollt nativ
      drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: scroller.scrollLeft,
        top: scroller.scrollTop,
        pageY: window.scrollY,
        moved: false
      }
    }

    function onPointerMove(event) {
      if (!drag || event.pointerId !== drag.id) return
      const dx = event.clientX - drag.x
      const dy = event.clientY - drag.y
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        drag.moved = true
        scroller.setPointerCapture(drag.id)
        scroller.classList.add('is-dragging')
      }
      scroller.scrollLeft = drag.left - dx
      // Im Vollbild scrollt der Rahmen selbst, sonst die Seite
      if (scroller.scrollHeight > scroller.clientHeight + 1) scroller.scrollTop = drag.top - dy
      else window.scrollTo(window.scrollX, drag.pageY - dy)
    }

    function swallowClick(event) {
      event.preventDefault()
      event.stopPropagation()
    }

    function onPointerUp(event) {
      if (!drag || event.pointerId !== drag.id) return // nur der Zeiger, der das Ziehen begonnen hat
      if (drag.moved) {
        scroller.classList.remove('is-dragging')
        // Der Klick am Ende des Ziehens soll keine Hundeseite öffnen
        scroller.addEventListener('click', swallowClick, { capture: true, once: true })
        setTimeout(() => scroller.removeEventListener('click', swallowClick, { capture: true }), 0)
      }
      drag = null
    }

    // Links und Bilder nicht als Drag & Drop greifen, sonst bricht das Verschieben ab
    const preventNativeDrag = (event) => event.preventDefault()

    scroller.addEventListener('wheel', onWheel, { passive: false })
    scroller.addEventListener('pointerdown', onPointerDown)
    scroller.addEventListener('pointermove', onPointerMove)
    scroller.addEventListener('pointerup', onPointerUp)
    scroller.addEventListener('pointercancel', onPointerUp)
    scroller.addEventListener('dragstart', preventNativeDrag)
    scroller.addEventListener('scroll', syncLabels, { passive: true })
    return () => {
      scroller.removeEventListener('wheel', onWheel)
      scroller.removeEventListener('pointerdown', onPointerDown)
      scroller.removeEventListener('pointermove', onPointerMove)
      scroller.removeEventListener('pointerup', onPointerUp)
      scroller.removeEventListener('pointercancel', onPointerUp)
      scroller.removeEventListener('dragstart', preventNativeDrag)
      scroller.removeEventListener('scroll', syncLabels)
    }
  }, [scrollRef, zoomTo, syncLabels])

  return { zoom, zoomTo, syncLabels }
}
