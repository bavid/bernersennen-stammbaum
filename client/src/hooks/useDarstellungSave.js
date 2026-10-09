import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api } from '../api'
import { normalizeDarstellung } from '../lib/darstellung.js'
import { useToast } from '../components/Toast.jsx'
import { t } from '../lib/i18n/index.js'

// Das Farbfeld meldet beim Ziehen jede Zwischenfarbe - gespeichert wird erst, wenn es so lange ruht.
export const LIVE_SAVE_DELAY_MS = 500

const nextFrame = (callback) =>
  typeof window.requestAnimationFrame === 'function' ? window.requestAnimationFrame(callback) : window.setTimeout(callback, 16)
const cancelFrame = (handle) =>
  typeof window.cancelAnimationFrame === 'function' ? window.cancelAnimationFrame(handle) : window.clearTimeout(handle)

// Legt patch über die Darstellung von me. Ohne Sitzung (me null - z. B. ein 401 während des Speicherns hat schon
// abgemeldet) bleibt es dabei, statt ein halbes "me" zu erfinden.
export function withDarstellung(me, patch) {
  return me ? { ...me, darstellung: { ...normalizeDarstellung(me.darstellung), ...patch } } : me
}

// Nach einem Fehler: die Felder aus patch zurück auf den zuletzt bestätigten Wert - nur die, die noch auf dem gescheiterten
// Wert stehen (eine neuere Wahl bleibt).
export function revertDarstellung(me, patch, confirmed) {
  if (!me) return me
  const now = normalizeDarstellung(me.darstellung)
  const keys = Object.keys(patch).filter((key) => now[key] === patch[key])
  return { ...me, darstellung: { ...now, ...Object.fromEntries(keys.map((key) => [key, confirmed[key]])) } }
}

// Speichern im Mini-Designer (Einstellungen → Darstellung): der Reihe nach (Pfeiltasten in einer Gruppe schicken je Taste
// eine Änderung - so kommt beim Server die letzte auch zuletzt an); scheitert eine, geht sie auf den zuletzt bestätigten
// Wert zurück (mit Hinweis). In Demo und Admin-Ansicht nur lokal. change(patch, { live: true }): das Farbfeld zieht gerade -
// gezeigt wird höchstens einmal je Bild (requestAnimationFrame), gespeichert erst nach einer Pause; verlässt man die Seite
// vorher, geht die letzte Farbe trotzdem mit.
export default function useDarstellungSave({ family, onFamilyChange, readOnly }) {
  const toast = useToast()
  const [saved, setSaved] = useState('')
  const confirmed = useRef(normalizeDarstellung(family.darstellung))
  const queue = useRef(Promise.resolve())
  const liveTimer = useRef(null)
  const livePatch = useRef(null)
  const frame = useRef(null)
  const framePatch = useRef(null)

  async function save(patch) {
    try {
      await api.setDarstellung(patch)
      confirmed.current = { ...confirmed.current, ...patch }
      setSaved(t('settings.saved'))
    } catch (err) {
      onFamilyChange((me) => revertDarstellung(me, patch, confirmed.current))
      toast(err.message)
    }
  }

  function enqueue(patch) {
    if (!readOnly) queue.current = queue.current.then(() => save(patch))
  }

  // Die gesammelte Zwischenfarbe jetzt zeigen (statt beim nächsten Bild).
  function showFrame() {
    if (frame.current !== null) cancelFrame(frame.current)
    frame.current = null
    const patch = framePatch.current
    framePatch.current = null
    if (patch) onFamilyChange((me) => withDarstellung(me, patch))
  }

  function flushLive() {
    clearTimeout(liveTimer.current)
    liveTimer.current = null
    showFrame()
    if (livePatch.current) enqueue(livePatch.current)
    livePatch.current = null
  }

  function change(patch, { live = false } = {}) {
    setSaved('')
    if (live) {
      framePatch.current = { ...framePatch.current, ...patch }
      if (frame.current === null) frame.current = nextFrame(showFrame)
      livePatch.current = { ...livePatch.current, ...patch }
      clearTimeout(liveTimer.current)
      liveTimer.current = setTimeout(flushLive, LIVE_SAVE_DELAY_MS)
      return
    }
    flushLive()
    onFamilyChange((me) => withDarstellung(me, patch))
    enqueue(patch)
  }

  // Immer mit dem neuesten flushLive (vor dem Zeichnen gesetzt, nicht während des Renderns).
  const flushRef = useRef(flushLive)
  useLayoutEffect(() => {
    flushRef.current = flushLive
  })
  useEffect(() => () => flushRef.current(), [])

  return { change, saved }
}
