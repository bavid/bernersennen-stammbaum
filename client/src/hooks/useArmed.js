import { useEffect, useState } from 'react'

const ARM_TIMEOUT_MS = 5000

// Zweistufige Bestätigung ("scharf schalten", dann bestätigen), die sich nach kurzer Zeit von selbst
// wieder entschärft - dasselbe Muster wie in LeaveFamilySection/RenameFamilyForm, hier als Hook für die
// Mitglieder-Seite (Leitung übergeben, Schlüssel erneuern, Tier übernehmen).
export default function useArmed(timeoutMs = ARM_TIMEOUT_MS) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return undefined
    const timer = setTimeout(() => setArmed(false), timeoutMs)
    return () => clearTimeout(timer)
  }, [armed, timeoutMs])

  return [armed, setArmed]
}
