import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import EnvBanner from './EnvBanner.jsx'
import HinweisBand from './HinweisBand.jsx'

// Die schmale Leiste über dem Kopf (Calm-down-Runde): statt bis zu drei voller Bänder eine 3-px-Linie für Vorschau/
// Testsystem (EnvBanner) und EINE Zeile, die sich der Hinweis des Admins (HinweisBand) und der Sitzungs-Hinweis teilen
// (Demo, Besuch, Admin-Ansicht - App.jsx). Der Sitzungs-Hinweis wird in App gerendert (dort kennt man die Sitzung) und
// per Portal in die Zeile gehängt (TopStripSlot) - so bleibt er im React-Baum der App (Router, Auftritt, Demo-Kontext),
// steht im DOM aber in derselben Zeile wie der Hinweis. Gibt es einen Sitzungs-Hinweis, rückt der Hinweis am Handy auf
// ein einzelnes Symbol zusammen (compact) - die Zeile bleibt so auch bei allem zusammen eine Zeile.
const TopStripContext = createContext(null)

export function TopStripProvider({ children }) {
  const [target, setTarget] = useState(null)
  const [sessionCount, setSessionCount] = useState(0)
  const value = useMemo(() => ({ target, setTarget, sessionCount, setSessionCount }), [target, sessionCount])
  return <TopStripContext.Provider value={value}>{children}</TopStripContext.Provider>
}

export default function TopStrip() {
  const strip = useContext(TopStripContext)
  const hasSession = (strip?.sessionCount ?? 0) > 0
  return (
    <>
      <EnvBanner />
      <div className={`top-strip${hasSession ? ' has-session' : ''}`}>
        <div className="top-strip-inner">
          <div className="top-strip-session" ref={strip?.setTarget} />
          <HinweisBand compact={hasSession} />
        </div>
      </div>
    </>
  )
}

// Ein Sitzungs-Hinweis (DemoBanner, VisitBanner, AdminViewBanner) in der Leiste oben. Ohne Leiste (einzelne
// Komponenten-Tests, App-Tests ohne main.jsx) steht er einfach an Ort und Stelle.
export function TopStripSlot({ children }) {
  const strip = useContext(TopStripContext)
  const register = strip?.setSessionCount

  useEffect(() => {
    if (!register) return undefined
    register((count) => count + 1)
    return () => register((count) => count - 1)
  }, [register])

  if (!strip) return children
  return strip.target ? createPortal(children, strip.target) : null
}
