import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import '../../styles/bilderrahmen.css'
import Modal from '../Modal.jsx'
import FrameSlides from './FrameSlides.jsx'
import FrameClock from './FrameClock.jsx'
import FrameControls from './FrameControls.jsx'
import FrameSettings from './FrameSettings.jsx'
import useSlideshow from '../../hooks/useSlideshow.js'
import useWakeLock from '../../hooks/useWakeLock.js'
import useIdleControls from '../../hooks/useIdleControls.js'
import { useFullscreen, useNow, useReducedMotion } from '../../hooks/useFrameEnvironment.js'
import { FADE_MS, dayKey, fotoKey, isNight, orderFotos } from '../../lib/bilderrahmen.js'

// Nach so vielen Ladefehlern in Folge fragt der Rahmen nach einer frischen Liste (abgelaufene Adressen, Netz zurück).
const FAILURES_BEFORE_RELOAD = 3
// Ließ sich gar kein Foto laden (Netz weg): nach einer Minute eine frische Liste - dann bekommen alle wieder einen Versuch.
const ALL_FAILED_RETRY_MS = 60 * 1000

function isTypingTarget(target) {
  return Boolean(target?.closest?.('input, textarea, select, button, a, dialog'))
}

// Der Bilderrahmen selbst - für /bilderrahmen (angemeldet) und /rahmen (anderes Gerät) gleich: Fotos mit Überblendung
// (FrameSlides), auf Wunsch Uhr, nachts dunkler, Steuerung auf Tippen/Maus (nach 4 s wieder weg), Tastatur ←/→, Leertaste,
// Esc, Vollbild und „Bildschirm anlassen“ (Wake Lock). fotos kommen geordnet vom Server, die Reihenfolge entsteht hier.
// onOptionenChange: Änderung im Einstellungs-Blatt; onExit: „Beenden“ (ohne: kein Knopf); onReload: frische Liste holen;
// auswahl: zusätzlicher Inhalt des Blatts (Tiere, Zeitraum).
export default function Bilderrahmen({ fotos, optionen, onOptionenChange, onExit, onReload, auswahl, label = 'Bilderrahmen' }) {
  const rootRef = useRef(null)
  const [paused, setPaused] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Schlüssel (ohne Signatur) des Fotos, das gerade wirklich steht - eine frisch signierte Adresse ist dasselbe Foto.
  const [shownKey, setShownKey] = useState(null)
  const failures = useRef(0)
  const now = useNow()
  const today = dayKey(now)
  const reducedMotion = useReducedMotion()
  const wakeLock = useWakeLock(true)
  const fullscreen = useFullscreen(rootRef)
  const exitFullscreen = fullscreen.exit
  const { visible: controlsVisible, show: showControls } = useIdleControls({ keepOpen: settingsOpen || paused })

  // Neue Reihenfolge nur, wenn neue Fotos kommen, die Reihenfolge-Optionen sich ändern oder ein neuer Tag beginnt.
  const { mischen, heuteZuerst } = optionen
  // now gehört bewusst nicht in die Abhängigkeiten (es tickt alle 15 s) - today reicht.
  const ordered = useMemo(() => orderFotos(fotos, { mischen, heuteZuerst, today: now }), [fotos, mischen, heuteZuerst, today])
  const { current, upcoming, count, allFailed, next, prev, markFailed } = useSlideshow(ordered)
  const currentKey = current ? fotoKey(current) : null
  const isShown = currentKey !== null && shownKey === currentKey

  // Weiter erst, wenn das gezeigte Foto wirklich geladen ist - auf einem langsamen Tablet läuft die Zeit nicht ins Leere.
  useEffect(() => {
    if (paused || !isShown || count < 2) return undefined
    const timer = setTimeout(next, optionen.intervall * 1000)
    return () => clearTimeout(timer)
  }, [paused, isShown, currentKey, count, next, optionen.intervall])

  // Das nächste Foto schon vorladen; scheitert es, fällt es heraus, bevor es dran wäre.
  useEffect(() => {
    if (!upcoming || !isShown) return undefined
    const image = new Image()
    image.referrerPolicy = 'no-referrer'
    image.onerror = () => markFailed(upcoming)
    image.src = upcoming.url
    return () => {
      image.onerror = null
    }
  }, [upcoming, isShown, markFailed])

  useEffect(() => {
    if (!allFailed || !onReload) return undefined
    const timer = setTimeout(onReload, ALL_FAILED_RETRY_MS)
    return () => clearTimeout(timer)
  }, [allFailed, onReload])

  const handleShown = useCallback((foto) => {
    failures.current = 0
    setShownKey(fotoKey(foto))
  }, [])

  const handleFailed = useCallback(
    (foto) => {
      markFailed(foto)
      failures.current += 1
      if (failures.current >= FAILURES_BEFORE_RELOAD && onReload) {
        failures.current = 0
        onReload()
      }
    },
    [markFailed, onReload]
  )

  const togglePause = useCallback(() => setPaused((value) => !value), [])
  const exit = useCallback(async () => {
    await exitFullscreen()
    onExit?.()
  }, [exitFullscreen, onExit])

  useEffect(() => {
    function handleKey(event) {
      if (settingsOpen || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      showControls()
      if (event.key === 'ArrowRight') next()
      else if (event.key === 'ArrowLeft') prev()
      else if (event.key === ' ' && !isTypingTarget(event.target)) {
        event.preventDefault()
        togglePause()
      } else if (event.key === 'Escape' && onExit && !document.fullscreenElement) exit()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [settingsOpen, showControls, next, prev, togglePause, exit, onExit])

  const dimmed = optionen.nacht && isNight(now)
  const durationS = optionen.intervall + FADE_MS / 1000

  return (
    <section
      ref={rootRef}
      className={`frame-root${controlsVisible ? '' : ' is-idle'}${dimmed ? ' is-night' : ''}${paused ? ' is-paused' : ''}${optionen.uhr ? ' has-clock' : ''}`}
      aria-label={label}
      aria-roledescription="Diashow"
      onPointerMove={showControls}
      onPointerDown={showControls}
      onFocus={showControls}
    >
      <FrameSlides
        foto={current}
        optionen={optionen}
        now={now}
        moving={!reducedMotion}
        durationS={durationS}
        onShown={handleShown}
        onFailed={handleFailed}
      />
      {allFailed && (
        <p className="frame-status" role="status">
          Die Fotos lassen sich gerade nicht laden – der Bilderrahmen versucht es gleich noch einmal.
        </p>
      )}
      {optionen.uhr && <FrameClock now={now} />}
      {dimmed && <div className="frame-night" aria-hidden="true" />}
      <p className="visually-hidden" aria-live="polite">
        {paused ? 'Diashow angehalten' : ''}
      </p>
      <FrameControls
        visible={controlsVisible}
        paused={paused}
        fullscreen={fullscreen}
        canStep={count > 1}
        onPrev={prev}
        onTogglePause={togglePause}
        onNext={next}
        onFullscreen={fullscreen.toggle}
        onSettings={() => setSettingsOpen(true)}
        onExit={onExit ? exit : undefined}
      />
      <Modal open={settingsOpen} title="Einstellungen" onClose={() => setSettingsOpen(false)} className="modal-sheet frame-sheet">
        <FrameSettings optionen={optionen} onChange={onOptionenChange} wakeLock={wakeLock}>
          {auswahl}
        </FrameSettings>
      </Modal>
    </section>
  )
}
