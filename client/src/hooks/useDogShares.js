import { useState } from 'react'
import { api } from '../api'
import { useToast } from '../components/Toast.jsx'

// "In Familien zeigen" für ein eigenes Tier (PUT /api/dogs/:id/shares): eine Änderung schreibt sofort optimistisch
// (kein Speichern-Knopf); schlägt sie fehl, geht die Auswahl zurück und ein Toast erklärt, warum. Während eine Änderung
// unterwegs ist, ist saving true - die Aufrufer sperren dann ihre Checkboxen, sonst könnte eine zweite, schneller
// beantwortete Anfrage von einer langsameren, älteren überschrieben werden. onSaved bekommt die Freigaben vom Server.
// Genutzt von SharePanel (Tierseite) und den Einstellungen (Familien → Eure Tiere in Familien).
export default function useDogShares(dog, onSaved) {
  const toast = useToast()
  const [shares, setShares] = useState(dog.shares || [])
  const [saving, setSaving] = useState(false)

  async function toggleShare(familyId, checked) {
    const previous = shares
    const next = checked ? [...shares, familyId] : shares.filter((id) => id !== familyId)
    setShares(next)
    setSaving(true)
    try {
      const result = await api.setDogShares(dog.id, next)
      setShares(result.shares)
      onSaved?.(result.shares)
    } catch (err) {
      setShares(previous)
      toast(err.message)
    } finally {
      setSaving(false)
    }
  }

  return { shares, saving, toggleShare }
}
