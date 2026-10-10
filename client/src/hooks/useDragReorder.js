import { useCallback, useEffect, useRef, useState } from 'react'
import useMediaQuery from './useMediaQuery.js'
import { indexFromPoint, moveItem, stepIndex } from '../lib/reorder.js'
import { t } from '../lib/i18n/index.js'

// Ab so vielen Pixeln Bewegung beginnt ein Ziehen - ein Tippen oder Klicken auf den Griff bleibt folgenlos.
export const DRAG_THRESHOLD_PX = 6
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const IDLE = Object.freeze({ mode: 'idle', key: null, from: -1, over: -1, dx: 0, dy: 0 })

// Anordnen per Ziehen (Zeiger: Maus und Finger, Pointer Events) und per Tastatur - ohne Abhängigkeit, für den Reiter
// „Fotos“ (PartnerBannerEditor, EinblickeEditor). keys: die Schlüssel der Einträge in aktueller Reihenfolge; onCommit(next,
// { from, to }) kommt genau einmal je abgeschlossenem Verschieben mit der neuen Reihenfolge der Schlüssel. labelFor(key):
// Name fürs Vorlesen („Foto 2“). Jeder Eintrag bekommt itemRef(key) (für die Trefferprüfung), itemClass/itemStyle(key)
// (Geist, Ablageziel, aufgenommen) und sein Griff handleProps(key).
// Zeiger: pointerdown auf dem Griff merkt sich den Start (mit Pointer Capture, wo es sie gibt), ab DRAG_THRESHOLD_PX zieht
// der Eintrag als Geist mit (translate - bei prefers-reduced-motion nur die Markierung), der Eintrag unter dem Zeiger ist
// das Ablageziel, pointerup legt ab; Escape bricht ab. Tastatur: Leertaste/Enter nimmt den Eintrag auf (aria-grabbed),
// Pfeiltasten verschieben ihn in der Vorschau (order), Leertaste/Enter legt ab, Escape bricht ab. announcement: der Text
// für eine aria-live-Region („Foto 2 – Stelle 3 von 4“).
export default function useDragReorder({ keys, onCommit, disabled = false, labelFor = (key, index) => t('Eintrag {n}', { n: index + 1 }) }) {
  const [state, setState] = useState(IDLE)
  const [announcement, setAnnouncement] = useState('')
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY)
  const stateRef = useRef(IDLE)
  const items = useRef(new Map())
  const pointer = useRef(null)
  const keysRef = useRef(keys)
  keysRef.current = keys

  const setDrag = useCallback((next) => {
    stateRef.current = next
    setState(next)
  }, [])

  const releasePointer = useCallback(() => {
    const started = pointer.current
    pointer.current = null
    try {
      started?.element?.releasePointerCapture?.(started.pointerId)
    } catch {
      // Ohne Pointer Capture (ältere Browser, jsdom) gibt es nichts freizugeben.
    }
  }, [])

  const cancel = useCallback(() => {
    releasePointer()
    if (stateRef.current.mode !== 'idle') setAnnouncement(t('Verschieben abgebrochen.'))
    setDrag(IDLE)
  }, [releasePointer, setDrag])

  const commit = useCallback(
    (from, to) => {
      const current = keysRef.current
      releasePointer()
      setDrag(IDLE)
      if (from === to || to < 0 || to >= current.length) {
        setAnnouncement(t('Verschieben beendet – nichts geändert.'))
        return
      }
      setAnnouncement(t('{label} liegt jetzt an Stelle {n} von {count}.', { label: labelFor(current[from], from), n: to + 1, count: current.length }))
      onCommit(moveItem(current, from, to), { from, to })
    },
    [labelFor, onCommit, releasePointer, setDrag]
  )

  // Escape bricht jedes laufende Verschieben ab - egal, wo der Fokus gerade ist.
  useEffect(() => {
    if (state.mode === 'idle') return undefined
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.mode, cancel])

  const itemRef = useCallback(
    (key) => (element) => {
      if (element) items.current.set(key, element)
      else items.current.delete(key)
    },
    []
  )

  function rects() {
    return keysRef.current.map((key) => items.current.get(key)?.getBoundingClientRect?.() ?? null)
  }

  function onPointerDown(key, event) {
    if (disabled || stateRef.current.mode !== 'idle') return
    if (typeof event.button === 'number' && event.button !== 0) return
    const from = keysRef.current.indexOf(key)
    if (from < 0) return
    pointer.current = { key, from, x: event.clientX, y: event.clientY, element: event.currentTarget, pointerId: event.pointerId }
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId)
    } catch {
      // Ohne Pointer Capture folgen die Ereignisse dem Griff nur, solange der Zeiger darauf bleibt.
    }
  }

  function onPointerMove(event) {
    const started = pointer.current
    if (!started) return
    const dx = event.clientX - started.x
    const dy = event.clientY - started.y
    const current = stateRef.current
    if (current.mode === 'idle' && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
    const hit = indexFromPoint(rects(), event.clientX, event.clientY)
    const over = hit ?? (current.mode === 'pointer' ? current.over : started.from)
    setDrag({ mode: 'pointer', key: started.key, from: started.from, over, dx, dy })
  }

  function onPointerUp() {
    if (!pointer.current) return
    const current = stateRef.current
    if (current.mode === 'pointer') commit(current.from, current.over)
    else releasePointer()
  }

  function onKeyDown(key, event) {
    if (disabled) return
    const current = stateRef.current
    const grabbed = current.mode === 'keyboard' && current.key === key
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      if (grabbed) {
        commit(current.from, current.over)
        return
      }
      const index = keysRef.current.indexOf(key)
      if (index < 0) return
      setDrag({ mode: 'keyboard', key, from: index, over: index, dx: 0, dy: 0 })
      setAnnouncement(t('{label} aufgenommen. Mit den Pfeiltasten verschieben, Leertaste legt ab, Escape bricht ab.', { label: labelFor(key, index) }))
      return
    }
    if (!grabbed) return
    const next = stepIndex(event.key, current.over, keysRef.current.length)
    if (next === null) return
    event.preventDefault()
    setDrag({ ...current, over: next })
    setAnnouncement(t('{label} – Stelle {n} von {count}', { label: labelFor(key, current.from), n: next + 1, count: keysRef.current.length }))
  }

  const order = state.mode === 'keyboard' ? moveItem(keys, state.from, state.over) : keys
  const isGrabbed = (key) => state.mode === 'keyboard' && state.key === key
  const isDragging = (key) => state.mode === 'pointer' && state.key === key
  const isDropTarget = (key) => state.mode === 'pointer' && state.over !== state.from && keys[state.over] === key

  return {
    order,
    mode: state.mode,
    activeKey: state.key,
    announcement,
    isGrabbed,
    isDragging,
    isDropTarget,
    itemRef,
    itemClass: (key) =>
      [isDragging(key) && 'is-dragging', isDropTarget(key) && 'is-drop-target', isGrabbed(key) && 'is-grabbed'].filter(Boolean).join(' '),
    itemStyle: (key) => (isDragging(key) && !reducedMotion ? { transform: `translate(${state.dx}px, ${state.dy}px)` } : undefined),
    handleProps: (key) => ({
      onPointerDown: (event) => onPointerDown(key, event),
      onPointerMove,
      onPointerUp,
      onPointerCancel: cancel,
      onKeyDown: (event) => onKeyDown(key, event),
      'aria-grabbed': isGrabbed(key)
    })
  }
}
