import { useState } from 'react'
import { api } from '../api'
import { useToast } from '../components/Toast.jsx'

// Freigaben eigener Tiere in Familien (PUT /api/dogs/:id/shares) für mehrere Tiere zugleich - die Tierseite ("Wer sieht
// {Name}?", ein Tier) und Einstellungen › Familien (alle eigenen Tiere je Familie). Ein Schalter schreibt sofort
// optimistisch; schlägt es fehl, geht er zurück und ein Toast erklärt, warum. Solange eine Änderung eines Tiers unterwegs
// ist, sind dessen Schalter gesperrt (isSaving) - sonst könnte eine schneller beantwortete zweite Anfrage von einer
// langsameren, älteren überschrieben werden. dogs: die Tiere beim ersten Rendern (mit dog.shares); onSaved(dogId,
// shares) bekommt die Freigaben vom Server.
export default function useShareMatrix(dogs, onSaved) {
  const toast = useToast()
  const [shares, setShares] = useState(() => Object.fromEntries(dogs.map((dog) => [dog.id, dog.shares || []])))
  const [saving, setSaving] = useState({})

  async function toggle(dogId, familyId, checked) {
    const previous = shares[dogId] || []
    const next = checked ? [...previous, familyId] : previous.filter((id) => id !== familyId)
    setShares((current) => ({ ...current, [dogId]: next }))
    setSaving((current) => ({ ...current, [dogId]: true }))
    try {
      const result = await api.setDogShares(dogId, next)
      setShares((current) => ({ ...current, [dogId]: result.shares }))
      onSaved?.(dogId, result.shares)
    } catch (err) {
      setShares((current) => ({ ...current, [dogId]: previous }))
      toast(err.message)
    } finally {
      setSaving((current) => ({ ...current, [dogId]: false }))
    }
  }

  return {
    sharesOf: (dogId) => shares[dogId] || [],
    isSaving: (dogId) => Boolean(saving[dogId]),
    toggle
  }
}
