import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useToast } from '../components/Toast.jsx'
import { isLastLeitung, rank, roleOf } from '../lib/roles.js'

// Mitglieder einer Familie (GET /api/family/members, Phase R) für den Reiter "Mitglieder" (MembersPage) und
// Einstellungen › Familien › [Familie] (FamilyManage, Phase W Schritt 2). Jede Änderung antwortet mit demselben Aufbau
// (oder 204 - dann wird neu geladen). ichBin aus der Antwort ist die eigene Rolle: ändert sie sich (Leitung übergeben,
// sich selbst herabstufen), zieht "me" über onFamilyChange mit, damit Kopf, Menü und die übrigen Seiten sie kennen.
// Die Rechte prüft weiter der Server (routes/members.js) - die Zahlen hier entscheiden nur, was angeboten wird.
export default function useFamilyMembers(family, onFamilyChange) {
  const toast = useToast()
  const [data, setData] = useState(undefined)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setData(await api.familyMembers())
  }, [])

  useEffect(() => {
    load().catch((err) => setError(err.message))
  }, [load])

  // Antwort einer Änderung übernehmen - die eigene Rolle (ichBin) ins "me", falls sie sich geändert hat.
  function applyPayload(payload) {
    setData(payload)
    if (payload.ichBin && payload.ichBin !== family.role) {
      onFamilyChange?.({
        ...family,
        role: payload.ichBin,
        memberships: (family.memberships || []).map((m) => (m.id === family.id ? { ...m, rolle: payload.ichBin } : m))
      })
    }
  }

  // Laufende Nummer je Aktion: Kommen zwei Änderungen kurz nacheinander, zählt nur die Antwort der letzten - eine verspätete
  // ältere Antwort darf den neueren Stand nicht überschreiben.
  const runId = useRef(0)
  async function run(action, message) {
    const id = ++runId.current
    setError(null)
    try {
      const payload = await action()
      if (id !== runId.current) return
      if (payload) applyPayload(payload)
      else {
        const fresh = await api.familyMembers()
        if (id !== runId.current) return
        setData(fresh)
      }
      if (message) toast(message)
    } catch (err) {
      if (id === runId.current) setError(err.message)
    }
  }

  const myRole = data?.ichBin ?? roleOf(family)
  // Ein Haushalt, der beigetreten ist - nicht die Anmeldung mit dem gemeinsamen Schlüssel der Familie.
  const isHousehold = family.home?.art === 'zuhause' && family.home.id !== family.id
  const selfId = isHousehold ? family.home.id : null
  const mitglieder = data?.mitglieder || []
  const self = mitglieder.find((member) => member.familyId === selfId)

  return {
    data,
    error,
    setError,
    reload: () => load().catch((err) => setError(err.message)),
    run,
    myRole,
    isLeitung: rank(myRole) >= rank('leitung'),
    canInvite: rank(myRole) >= rank('stellvertretung'),
    isHousehold,
    selfId,
    mitglieder,
    lastLeitung: Boolean(self && isLastLeitung(self, mitglieder))
  }
}
