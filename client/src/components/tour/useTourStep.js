import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ROUTE_FIRST_ANIMAL, findTarget, firstAnimalRoute } from '../../lib/tour.js'

// So lange sucht ein Schritt sein Ziel (Seite wechseln, nachladen), danach wird er übersprungen.
export const TARGET_WAIT_MS = 4000
// Optionale Ziele (step.optional, z. B. ein Reiter, den es noch nicht überall gibt) halten nur kurz auf.
const OPTIONAL_WAIT_MS = 1500
const POLL_MS = 100
const ANIMALS_ROUTE = '/tiere'

const pathOf = (route) => route?.split('?')[0] ?? null

// Löst den aktuellen Schritt auf: ggf. zur Seite wechseln, auf das Ziel warten, sonst onMissing() (überspringen).
// Die Seite des ersten Tiers (ROUTE_FIRST_ANIMAL) merkt sich der Rundgang aus dem Raster - kennt er sie noch nicht,
// schaut er kurz unter /tiere nach. Ergebnis: { ready, target, asking } - asking: die Rückfrage des Schritts gilt.
export default function useTourStep(step, stepId, { waitMs = TARGET_WAIT_MS, onMissing }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const pathRef = useRef(pathname)
  const animalRef = useRef(null)
  const missingRef = useRef(onMissing)
  const [found, setFound] = useState({ id: null, target: null, asking: false })
  pathRef.current = pathname
  missingRef.current = onMissing

  useEffect(() => {
    if (!step) return undefined
    const started = Date.now()
    const limit = step.optional ? Math.min(waitMs, OPTIONAL_WAIT_MS) : waitMs
    let route = step.route === ROUTE_FIRST_ANIMAL ? animalRef.current : step.route
    if (step.route === ROUTE_FIRST_ANIMAL && !route && pathRef.current !== ANIMALS_ROUTE) navigate(ANIMALS_ROUTE)
    else if (route && pathRef.current !== pathOf(route)) navigate(route)

    function tick() {
      const animal = firstAnimalRoute()
      if (animal) animalRef.current = animal
      if (step.route === ROUTE_FIRST_ANIMAL && !route && animal) {
        route = animal
        navigate(route)
        return false
      }
      const onPage = !step.route || (route && pathRef.current === pathOf(route))
      const target = onPage && step.target ? findTarget(step.target) : null
      if (onPage && (!step.target || target)) {
        const asking = Boolean(step.ask && !document.querySelector(step.ask.askWhen))
        setFound({ id: stepId, target, asking })
        return true
      }
      if (Date.now() - started < limit) return false
      missingRef.current()
      return true
    }

    if (tick()) return undefined
    const timer = setInterval(() => tick() && clearInterval(timer), POLL_MS)
    return () => clearInterval(timer)
    // Nur je Schritt neu - der Pfad wird über pathRef gelesen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId])

  const ready = found.id === stepId && Boolean(step)
  return { ready, target: ready ? found.target : null, asking: ready && found.asking }
}
