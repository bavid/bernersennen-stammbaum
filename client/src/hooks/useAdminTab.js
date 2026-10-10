import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SUB_PARAM, TAB_PARAM, adminSection, adminTarget, resolveAdminTab, writeAdminParams } from '../lib/adminTabs.js'

// Gewählter Haupt- und Unterreiter im Admin: in der Adresse (?tab=&bereich=, alte ?tab=-Werte werden zugeordnet) - so
// lässt sich jeder Unterreiter verlinken und bleibt beim Neuladen stehen; der Wechsel ersetzt den Eintrag im Verlauf.
// Wer zu einem Hauptreiter zurückkehrt, landet wieder in dem Unterreiter, den er dort zuletzt offen hatte (subOf).
export default function useAdminTab() {
  const [searchParams, setSearchParams] = useSearchParams()
  const current = resolveAdminTab(searchParams.get(TAB_PARAM), searchParams.get(SUB_PARAM))
  const [lastSubs, setLastSubs] = useState({})

  function subOf(key) {
    if (key === current.tab) return current.bereich
    return lastSubs[key] ?? adminSection(key).subs[0].key
  }

  // key: Hauptreiter, Unterreiter oder alter Reiter; bereich (optional): Unterreiter des Hauptreiters.
  function select(key, bereich) {
    const wanted = adminSection(key) && !bereich ? subOf(key) : bereich
    const next = adminTarget(key, wanted)
    setLastSubs((subs) => ({ ...subs, [current.tab]: current.bereich, [next.tab]: next.bereich }))
    setSearchParams((params) => writeAdminParams(params, next), { replace: true })
    return next
  }

  return { current, select, subOf }
}
