import { useState } from 'react'
import { api } from '../api'

// Anmelden in einem Demo-Partner-Bereich (POST /api/demo { as: 'partner', slug }, lib/demoPartners.js) - geteilt
// von den Demo-Knöpfen auf /partner-werden (PartnerInfoPage) und dem Partner-Einstieg der Login-Seite
// (LoginPartnerEntry). pending: der Schlüssel des laufenden Knopfs (oder null), error: die letzte Fehlermeldung.
// onDemo bekommt die Antwort (Form von /me) - App.jsx setzt damit die Sitzung.
export function usePartnerDemo(onDemo) {
  const [pending, setPending] = useState(null)
  const [error, setError] = useState(null)

  async function startDemo(key, slug) {
    setError(null)
    setPending(key)
    try {
      onDemo(await api.demo({ as: 'partner', slug }))
    } catch (err) {
      setError(err.message)
      setPending(null)
    }
  }

  return { pending, error, startDemo }
}
