import { useState } from 'react'
import { api } from '../api'

// Anmelden in einem Demo-Partner-Bereich - geteilt von den Demo-Knöpfen auf /partner-werden (PartnerInfoPage)
// und dem Partner-Einstieg der Login-Seite (LoginPartnerEntry). Ziel ist entweder ein Demo-Partner mit eigenem
// Bereich (POST /api/demo { as: 'partner', slug }, lib/demoPartners.js) oder das Demo-Tierheim
// (POST /api/demo { as: 'tierheim' }). startDemo(key, slug) bleibt als Kurzform für Partner erhalten.
// pending: der Schlüssel des laufenden Knopfs (oder null), error: die letzte Fehlermeldung.
// onDemo bekommt die Antwort (Form von /me) - App.jsx setzt damit die Sitzung.
export function usePartnerDemo(onDemo) {
  const [pending, setPending] = useState(null)
  const [error, setError] = useState(null)

  async function startDemo(key, target) {
    const body = typeof target === 'string' ? { as: 'partner', slug: target } : target
    setError(null)
    setPending(key)
    try {
      onDemo(await api.demo(body))
    } catch (err) {
      setError(err.message)
      setPending(null)
    }
  }

  return { pending, error, startDemo }
}
