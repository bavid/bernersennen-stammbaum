import { useRef } from 'react'

// Ab so viel waagerechtem Weg zählt eine Bewegung als Wischen statt als Antippen.
export const SWIPE_THRESHOLD_PX = 50
// Waagerecht muss deutlich überwiegen, sonst war es ein (abgerutschtes) senkrechtes Ziehen.
const HORIZONTAL_DOMINANCE = 1.5

// Waagerechtes Wischen mit Finger oder Maus über Pointer-Events. onSwipeLeft = nach links gewischt (nächstes),
// onSwipeRight = nach rechts (voriges). onDrag(dx) meldet während des Ziehens den Weg, onRelease(swiped, dx) das Ende -
// swiped sagt, ob daraus ein Wischen wurde, dx in welche Richtung.
// Es zählt nur der erste Finger: ein zweiter (Zoomen) bewegt nichts. Nach einem Wischen schluckt onClickCapture den
// Klick, den der Browser danach noch feuert - sonst würde z. B. eine Lightbox, die auf Klick schließt, beim Wischen
// zugehen. Tastatur-Klicks (detail 0) kommen immer durch. Bewusst ohne Pointer Capture: die leitet den Klick auf das
// umgebende Element um, und Knöpfe darin würden nicht mehr ausgelöst.
export default function useSwipe({ onSwipeLeft, onSwipeRight, onDrag, onRelease }) {
  const start = useRef(null)
  const swiped = useRef(false)

  const isTracked = (event) => start.current !== null && event.isPrimary !== false && event.pointerId === start.current.id

  function end(isSwipe, dx) {
    start.current = null
    onRelease?.(isSwipe, dx)
  }

  function onPointerDown(event) {
    if (event.isPrimary === false || event.button > 0) return
    start.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
    swiped.current = false
  }

  function onPointerMove(event) {
    if (!isTracked(event)) return
    // Maustaste außerhalb des Fensters losgelassen: das pointerup kam hier nie an.
    if (event.pointerType === 'mouse' && event.buttons === 0) {
      end(false, 0)
      return
    }
    onDrag?.(event.clientX - start.current.x)
  }

  function onPointerUp(event) {
    if (!isTracked(event)) return
    const dx = event.clientX - start.current.x
    const dy = event.clientY - start.current.y
    const isSwipe = Math.abs(dx) >= SWIPE_THRESHOLD_PX && Math.abs(dx) >= Math.abs(dy) * HORIZONTAL_DOMINANCE
    end(isSwipe, dx)
    if (!isSwipe) return
    swiped.current = true
    if (dx < 0) onSwipeLeft?.()
    else onSwipeRight?.()
  }

  function onPointerCancel(event) {
    if (isTracked(event)) end(false, 0)
  }

  function onClickCapture(event) {
    if (!swiped.current) return
    swiped.current = false
    if (event.detail > 0) event.stopPropagation()
  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture }
}
