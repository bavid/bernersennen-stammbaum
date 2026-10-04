import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { displayName } from '../lib/timeline.js'
import { useToast } from '../components/Toast.jsx'

// Zustand des Dialogs "Neues Tier anlegen" (components/AnimalCreateModal.jsx) - an einer Stelle statt je Seite:
// form null: zu. { livesWith, moreValues: null }: das kurze Formular (QuickAnimalForm, livesWith optional fest
// vorgegeben, z. B. "+ Mitbewohner" im Stammbaum). moreValues gesetzt: nach "Mehr Angaben …" das volle DogForm damit
// vorbefüllt. Nach dem Anlegen: Hinweis "… ist jetzt dabei" und weiter zur Tierseite.
export default function useAnimalCreate() {
  const navigate = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState(null)

  const open = useCallback((livesWith = null) => setForm({ livesWith, moreValues: null }), [])
  const close = useCallback(() => setForm(null), [])
  const showMore = useCallback((moreValues) => setForm((current) => (current ? { ...current, moreValues } : current)), [])

  const announceCreated = useCallback(
    (dog) => {
      setForm(null)
      toast(`${displayName(dog)} ist jetzt dabei`)
      navigate(`/tier/${dog.id}`)
    },
    [navigate, toast]
  )

  // Das volle DogForm legt nicht selbst an - es reicht die Angaben hierher.
  const createFull = useCallback(
    async (payload) => {
      const dog = await api.createDog(payload)
      announceCreated(dog)
    },
    [announceCreated]
  )

  return { form, open, close, showMore, announceCreated, createFull }
}
