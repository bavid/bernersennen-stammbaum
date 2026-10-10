import { useCallback, useRef } from 'react'

// Breite eines A4-Bogens (.voucher-sheet, 210 mm) in CSS-Pixeln.
export const SHEET_WIDTH_PX = (210 * 96) / 25.4

// Faktor, mit dem ein Bogen in einen Behälter der Breite width passt - nie größer als 1 (Audit: am Handy lagen die
// 794 px breiten Bögen in einem 359 px breiten Scrollbereich und waren abgeschnitten).
export function sheetScale(width) {
  if (!width || width <= 0) return 1
  return Math.min(1, Math.floor((width / SHEET_WIDTH_PX) * 1000) / 1000)
}

// Ref-Callback für .voucher-sheets: setzt --sheet-scale nach der Breite des Behälters. print.css verkleinert die Bögen
// damit nur auf dem Bildschirm (@media screen) - gedruckt wird immer genau A4.
export default function useSheetFit() {
  const observerRef = useRef(null)
  return useCallback((element) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!element) return
    const apply = () => element.style.setProperty('--sheet-scale', String(sheetScale(element.clientWidth)))
    apply()
    if (typeof ResizeObserver === 'undefined') return
    observerRef.current = new ResizeObserver(apply)
    observerRef.current.observe(element)
  }, [])
}
