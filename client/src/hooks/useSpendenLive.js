import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { ansageText, POLL_MS } from '../lib/spendenLive.js'

const STREAM_URL = '/api/finanzierung/live/stream'

// „Spenden live“: erst GET /api/finanzierung/live, dann der Live-Strom (Server-Sent Events, Ereignis „stand“). Gibt es
// keinen EventSource oder bricht der Strom ab (z. B. 503 bei zu vielen Verbindungen), fragt der Hook alle 60 s nach.
// ansage: Text für die Live-Region - nur, wenn sich die Monatssumme geändert hat (nie bei jedem Abruf).
export default function useSpendenLive() {
  const [state, setState] = useState({ live: undefined, ansage: '' })
  const lastRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    let source = null
    let timer = null

    function apply(next) {
      if (cancelled || !next) return
      const ansage = ansageText(lastRef.current, next)
      lastRef.current = next
      setState((current) => ({ live: next, ansage: ansage || current.ansage }))
    }

    function load() {
      // Über ein Promise, damit auch ein synchroner Fehler beim Abruf nur den Block ausblendet.
      return Promise.resolve()
        .then(() => api.finanzierungLive())
        .then(apply)
        .catch(() => {
          if (!cancelled && lastRef.current === null) setState((current) => ({ ...current, live: null }))
        })
    }

    function startPolling() {
      if (!timer) timer = setInterval(load, POLL_MS)
    }

    function startStream() {
      if (typeof window === 'undefined' || typeof window.EventSource !== 'function') return startPolling()
      try {
        source = new window.EventSource(STREAM_URL)
      } catch {
        return startPolling()
      }
      source.addEventListener('stand', (event) => {
        try {
          apply(JSON.parse(event.data))
        } catch {
          // Ein kaputtes Ereignis ignorieren - das nächste bringt den ganzen Stand.
        }
      })
      source.onerror = () => {
        source?.close()
        source = null
        startPolling()
      }
    }

    load().then(() => {
      if (!cancelled) startStream()
    })
    return () => {
      cancelled = true
      source?.close()
      if (timer) clearInterval(timer)
    }
  }, [])

  return state
}
