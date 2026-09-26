// Zoom des Stammbaums: Grenzen, Stufen, "Einpassen" und Scroll-Anker.

export const MIN_ZOOM = 0.35
export const MAX_ZOOM = 1.5
const STEP = 1.2

export function clampZoom(zoom) {
  if (!Number.isFinite(zoom)) return 1
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom * 100) / 100))
}

export const zoomIn = (zoom) => clampZoom(zoom * STEP)
export const zoomOut = (zoom) => clampZoom(zoom / STEP)

// Zoom, bei dem der ganze Baum sichtbar ist – verkleinert nur, vergrößert nie über 100 %.
// Abgerundet, damit der Baum nicht um ein paar Pixel übersteht.
export function fitZoom(content, available) {
  const ratios = [available.width / content.width]
  if (available.height) ratios.push(available.height / content.height)
  return clampZoom(Math.floor(Math.min(1, ...ratios) * 100) / 100)
}

// Neue Scroll-Position, damit der Punkt unter dem Anker (Maus oder Bildmitte) stehen bleibt.
// pad: Innenabstand vor dem Baum, der nicht mitskaliert.
export function anchoredScroll({ scroll, anchor, pad, from, to }) {
  return ((scroll + anchor - pad) / from) * to + pad - anchor
}
