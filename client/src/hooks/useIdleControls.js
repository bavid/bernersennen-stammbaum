import { useCallback, useEffect, useRef, useState } from 'react'
import { CONTROLS_HIDE_MS } from '../lib/bilderrahmen.js'

// Steuerung des Bilderrahmens: sichtbar nach Tippen, Mausbewegung, Taste oder Fokus - und nach hideMs (4 s) wieder weg.
// keepOpen (angehalten, offenes Einstellungs-Blatt): bleibt sichtbar, solange es gilt - auch wenn dazwischen show() kommt.
export default function useIdleControls({ hideMs = CONTROLS_HIDE_MS, keepOpen = false } = {}) {
  const [visible, setVisible] = useState(true)
  const timer = useRef(null)
  const keepOpenRef = useRef(keepOpen)
  keepOpenRef.current = keepOpen

  const show = useCallback(() => {
    setVisible(true)
    clearTimeout(timer.current)
    if (!keepOpenRef.current) timer.current = setTimeout(() => setVisible(false), hideMs)
  }, [hideMs])

  useEffect(() => {
    show()
    return () => clearTimeout(timer.current)
  }, [keepOpen, show])

  return { visible, show }
}
