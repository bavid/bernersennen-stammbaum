import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import TourChoice from './TourChoice.jsx'
import TourPopover from './TourPopover.jsx'
import TourPrompt from './TourPrompt.jsx'
import { TourBusyContext, TourContext } from './tourContext.js'
import useTourStep, { TARGET_WAIT_MS } from './useTourStep.js'
import { startRoute } from '../../lib/areas.js'
import { isReadOnly } from '../../lib/demo.js'
import {
  TOUR_SCOPE,
  TOUR_STATUS,
  buildTour,
  chaptersFor,
  isTourAvailable,
  markPrompted,
  saveTourStatus,
  shouldPrompt,
  statusAfterTour,
  tourStatus
} from '../../lib/tour.js'
import { CHAPTER_TITLES } from '../../lib/tourSteps.js'
import { useT } from '../../lib/i18n/index.js'
import '../../styles/tour.css'

const homeIdOf = (family) => family?.home?.id ?? family?.id

// Fragt einmal auf der Startseite (lib/tour.js shouldPrompt), sobald sich jemand angemeldet oder eine Demo betreten hat.
// In Tests (Vitest, MODE 'test') fragt der Rundgang nicht von selbst - sonst stünde die Frage in jedem App-Test im Weg.
const AUTO_PROMPT = import.meta.env.MODE !== 'test'

function usePromptOnce(family, running, enabled) {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const askedFor = useRef(null)
  useEffect(() => {
    if (!enabled || running || askedFor.current === homeIdOf(family)) return
    if (pathname !== startRoute(family) || !shouldPrompt(family)) return
    askedFor.current = homeIdOf(family)
    markPrompted(family)
    setOpen(true)
  }, [family, pathname, running, enabled])
  return [open, setOpen]
}

// Rundgang (Self-Onboarding): fragt, führt Schritt für Schritt mit Lichtkegel durch die echte App und merkt sich den
// Stand je Zuhause (lib/tour.js). Neu starten: useTour().start() - Einstellungen › App bzw. Zugang (TourRestart).
// Fehlt das Ziel eines Schritts, geht es ohne Halt weiter; Escape beendet, die App bleibt dabei bedienbar.
// Ein Durchgang zeigt ein Kapitel; danach (außer bei „Kurz“) die Karte „Wie geht’s weiter?“ (TourChoice) mit den übrigen
// Kapiteln - gezeigte (run.done) sind abgehakt, „Fertig“ beendet.
export default function TourProvider({ family, onFamilyChange = () => {}, waitMs = TARGET_WAIT_MS, autoPrompt = AUTO_PROMPT, children }) {
  const t = useT()
  const [run, setRun] = useState(null)
  const [promptOpen, setPromptOpen] = usePromptOnce(family, Boolean(run), autoPrompt)
  const returnFocus = useRef(null)
  const chapters = useMemo(() => chaptersFor(family), [family])
  const familyRef = useRef(family)
  familyRef.current = family

  const remember = useCallback(
    (status) => {
      const current = familyRef.current
      if (status === tourStatus(current) && !current?.isDemo) return
      saveTourStatus(current, status).then((next) => {
        if (next !== current) onFamilyChange((latest) => (latest ? { ...latest, rundgang: next.rundgang } : latest))
      })
    },
    [onFamilyChange]
  )

  const finish = useCallback(() => {
    setRun(null)
    remember(statusAfterTour(familyRef.current))
    const back = returnFocus.current
    returnFocus.current = null
    if (back?.isConnected) back.focus({ preventScroll: true })
  }, [remember])

  const move = useCallback((dir) => {
    setRun((current) => {
      if (!current) return current
      const index = current.index + dir
      if (index < 0) return { ...current, index: 0, dir: 1, id: current.id + 1 }
      return { ...current, index, dir, id: current.id + 1 }
    })
  }, [])

  // Ein Kapitel starten; done: schon gezeigte Kapitel dieses Durchgangs (für die Haken auf der Karte).
  const startChapter = useCallback((chapterKey, { offerChoice = true, done = [], id = 1 } = {}) => {
    const steps = buildTour(familyRef.current, { chapterKey })
    if (steps.length === 0) return
    if (!returnFocus.current) returnFocus.current = document.activeElement
    setRun({ steps, index: 0, dir: 1, id, chapter: steps[0].chapter, done, offerChoice, choosing: false })
  }, [])

  const start = useCallback(
    ({ scope = TOUR_SCOPE.kurz, chapterKey } = {}) => {
      setPromptOpen(false)
      startChapter(chapterKey, { offerChoice: scope === TOUR_SCOPE.alles || Boolean(chapterKey) })
    },
    [setPromptOpen, startChapter]
  )

  const pick = useCallback(
    (chapterKey) => startChapter(chapterKey, { done: run?.done ?? [], id: (run?.id ?? 0) + 1 }),
    [run, startChapter]
  )

  const step = run && !run.choosing ? run.steps[run.index] : undefined
  const { ready, target, asking } = useTourStep(step, run ? run.id : null, { waitMs, onMissing: () => move(run?.dir ?? 1) })

  // Kapitel zu Ende: Karte „Wie geht’s weiter?“ oder (bei „Kurz“) Schluss.
  useEffect(() => {
    if (!run || run.choosing || run.index < run.steps.length) return
    if (!run.offerChoice) {
      finish()
      return
    }
    setRun({ ...run, choosing: true, done: [...new Set([...run.done, run.chapter])] })
  }, [run, finish])

  useEffect(() => {
    if (!run) return undefined
    const onKey = (event) => event.key === 'Escape' && finish()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [run, finish])

  function handleAsk() {
    const button = document.querySelector(step.ask.actionTarget)
    finish()
    button?.click()
  }

  function closePrompt(status) {
    setPromptOpen(false)
    remember(status)
  }

  const value = useMemo(() => (isTourAvailable(family) ? { start, chapters } : null), [family, start, chapters])
  const stepAnnounce = step && ready ? `${t(CHAPTER_TITLES[step.chapter])}: ${t(asking ? step.ask.title : step.title)}` : ''
  const announce = run?.choosing ? t('Wie geht’s weiter?') : stepAnnounce
  return (
    <TourContext.Provider value={value}>
      <TourBusyContext.Provider value={promptOpen || Boolean(run)}>{children}</TourBusyContext.Provider>
      {promptOpen && !run && (
        <TourPrompt
          chapters={chapters}
          isDemo={Boolean(family?.isDemo)}
          onStart={start}
          onClose={() => closePrompt(statusAfterTour(family))}
          onNever={() => closePrompt(TOUR_STATUS.aus)}
        />
      )}
      {step && ready && (
        <TourPopover
          step={step}
          index={run.index}
          total={run.steps.length}
          target={target}
          asking={asking}
          isDemo={Boolean(family?.isDemo) && run.done.length === 0}
          continues={run.offerChoice}
          canAct={!isReadOnly(family) && Boolean(step.ask && document.querySelector(step.ask.actionTarget))}
          onBack={() => move(-1)}
          onNext={() => move(1)}
          onEnd={finish}
          onAsk={handleAsk}
        />
      )}
      {run?.choosing && <TourChoice chapters={chapters} done={run.done} onPick={pick} onEnd={finish} />}
      <div className="visually-hidden" role="status" aria-live="polite">
        {announce}
      </div>
    </TourContext.Provider>
  )
}
