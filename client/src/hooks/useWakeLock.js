import { useEffect, useState } from 'react'

// Bildschirm anlassen, solange der Bilderrahmen läuft (Screen Wake Lock API). Der Browser gibt die Sperre frei, sobald der
// Tab verdeckt ist - beim Zurückkommen (visibilitychange) holen wir sie neu. Ohne die API (ältere Browser, kein https)
// oder bei Ablehnung bleibt alles wie es ist; status sagt es dem Einstellungs-Blatt:
// 'aktiv' | 'bereit' (noch nicht/gerade nicht gehalten) | 'nicht-verfuegbar' | 'abgelehnt'.
export function canWakeLock() {
  return typeof navigator !== 'undefined' && typeof navigator.wakeLock?.request === 'function'
}

async function release(sentinel) {
  try {
    await sentinel?.release?.()
  } catch {
    // schon freigegeben
  }
}

export default function useWakeLock(enabled = true) {
  const [status, setStatus] = useState(() => (canWakeLock() ? 'bereit' : 'nicht-verfuegbar'))

  useEffect(() => {
    if (!enabled || !canWakeLock()) return undefined
    let sentinel = null
    let cancelled = false

    async function acquire() {
      if (cancelled || document.visibilityState !== 'visible') return
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (cancelled) {
          release(lock)
          return
        }
        sentinel = lock
        setStatus('aktiv')
        lock.addEventListener?.('release', () => {
          if (!cancelled) setStatus('bereit')
        })
      } catch {
        if (!cancelled) setStatus('abgelehnt')
      }
    }

    function handleVisibility() {
      if (document.visibilityState === 'visible') acquire()
    }

    acquire()
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibility)
      release(sentinel)
    }
  }, [enabled])

  return status
}
