import { useCallback, useMemo, useRef, useState } from 'react'
import { fotoKey } from '../lib/bilderrahmen.js'

const NO_FAILURES = new Set()

// Position in der Diashow über den Schlüssel des Fotos (lib/bilderrahmen.js fotoKey) statt nur über den Index - so
// bleibt das gezeigte Foto stehen, wenn die Liste neu kommt (alle paar Minuten) oder ein anderes Foto ausfällt.
function resolveIndex(list, pos) {
  if (list.length === 0) return -1
  const found = pos.key ? list.findIndex((foto) => fotoKey(foto) === pos.key) : -1
  if (found >= 0) return found
  return pos.index >= list.length ? 0 : Math.max(pos.index, 0)
}

function step(list, pos, direction) {
  if (list.length === 0) return pos
  const index = (resolveIndex(list, pos) + direction + list.length) % list.length
  return { key: fotoKey(list[index]), index }
}

// fotos: schon geordnet (orderFotos). Kaputte Fotos (Ladefehler) fallen heraus - aber nur für genau diese Liste: kommt eine
// neue (Nachladen, neue Auswahl), bekommen alle wieder einen Versuch (z. B. nach einem kurzen WLAN-Aussetzer). Fällt das
// gezeigte Foto aus, rückt das nächste an seine Stelle. allFailed: es gibt Fotos, aber keins ließ sich laden.
export default function useSlideshow(fotos) {
  const [failedState, setFailedState] = useState({ list: null, urls: NO_FAILURES })
  const [pos, setPos] = useState({ key: null, index: 0 })
  const failed = failedState.list === fotos ? failedState.urls : NO_FAILURES
  const visible = useMemo(() => fotos.filter((foto) => !failed.has(foto.url)), [fotos, failed])
  const visibleRef = useRef(visible)
  visibleRef.current = visible
  const fotosRef = useRef(fotos)
  fotosRef.current = fotos

  const index = resolveIndex(visible, pos)
  const current = index >= 0 ? visible[index] : null
  const upcoming = visible.length > 1 ? visible[(index + 1) % visible.length] : null

  const next = useCallback(() => setPos((p) => step(visibleRef.current, p, 1)), [])
  const prev = useCallback(() => setPos((p) => step(visibleRef.current, p, -1)), [])

  // Alles, was die Updater brauchen, wird vorher gelesen - die Updater selbst bleiben rein (StrictMode ruft sie doppelt).
  const markFailed = useCallback((foto) => {
    const list = fotosRef.current
    const shown = visibleRef.current
    const at = Math.max(
      shown.findIndex((item) => item.url === foto.url),
      0
    )
    const rest = shown.filter((item) => item.url !== foto.url)
    const replacement = rest.length ? { key: fotoKey(rest[at % rest.length]), index: at % rest.length } : { key: null, index: 0 }
    const key = fotoKey(foto)
    setFailedState((state) => {
      const urls = state.list === list ? state.urls : NO_FAILURES
      return urls.has(foto.url) ? state : { list, urls: new Set(urls).add(foto.url) }
    })
    setPos((p) => (p.key === key ? replacement : p))
  }, [])

  return { current, upcoming, index, count: visible.length, allFailed: fotos.length > 0 && visible.length === 0, next, prev, markFailed }
}
