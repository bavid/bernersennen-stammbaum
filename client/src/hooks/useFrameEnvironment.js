import { useCallback, useEffect, useState } from 'react'

// Kleine Hilfen für den Bilderrahmen rund um das Gerät: Bewegung reduzieren, die laufende Uhr und der Vollbild-Modus.

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const CLOCK_STEP_MS = 15 * 1000

function motionQuery() {
  return typeof window !== 'undefined' ? window.matchMedia?.(REDUCED_MOTION_QUERY) || null : null
}

// true, wenn das System „Bewegung reduzieren“ wünscht - dann nur Überblenden, kein Schwenk und kein Zoom.
export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => Boolean(motionQuery()?.matches))
  useEffect(() => {
    const query = motionQuery()
    if (!query?.addEventListener) return undefined
    const handle = (event) => setReduced(event.matches)
    query.addEventListener('change', handle)
    return () => query.removeEventListener('change', handle)
  }, [])
  return reduced
}

// Die aktuelle Zeit, alle 15 Sekunden neu (Uhr, Nacht, „Heute vor … Jahren“ nach Mitternacht).
export function useNow(stepMs = CLOCK_STEP_MS) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), stepMs)
    return () => clearInterval(timer)
  }, [stepMs])
  return now
}

function fullscreenElement() {
  return typeof document !== 'undefined' ? document.fullscreenElement || null : null
}

// Vollbild für das Element in ref (Fullscreen API). Ohne Unterstützung (z. B. iPhone) ist supported false - dann fehlt
// der Knopf einfach.
export function useFullscreen(ref) {
  const supported = typeof document !== 'undefined' && Boolean(document.fullscreenEnabled)
  const [active, setActive] = useState(() => Boolean(fullscreenElement()))

  useEffect(() => {
    const handle = () => setActive(Boolean(fullscreenElement()))
    document.addEventListener('fullscreenchange', handle)
    return () => document.removeEventListener('fullscreenchange', handle)
  }, [])

  const exit = useCallback(async () => {
    if (!fullscreenElement()) return
    try {
      await document.exitFullscreen()
    } catch {
      // schon verlassen
    }
  }, [])

  const toggle = useCallback(async () => {
    if (fullscreenElement()) return exit()
    try {
      await ref.current?.requestFullscreen?.()
    } catch {
      // abgelehnt (z. B. ohne Nutzer-Geste) - dann bleibt es beim Fenster
    }
    return undefined
  }, [ref, exit])

  return { supported, active, toggle, exit }
}
