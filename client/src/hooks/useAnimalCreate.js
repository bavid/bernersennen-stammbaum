import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { displayName } from '../lib/timeline.js'
import { t } from '../lib/i18n/index.js'
import { useToast } from '../components/Toast.jsx'

// Zustand des Dialogs "Neues Tier anlegen" (components/AnimalCreateModal.jsx) - an einer Stelle statt je Seite:
// form null: zu, { livesWith }: offen (QuickAnimalForm, livesWith optional fest vorgegeben, z. B. "+ Mitbewohner" im
// Stammbaum). Nach dem Anlegen: Hinweis "… ist jetzt dabei" und weiter zur Tierseite - dort lädt state.neuesTier zur ersten
// Erinnerung ein (components/dog/DogChronicle.jsx).
export default function useAnimalCreate() {
  const navigate = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState(null)

  const open = useCallback((livesWith = null) => setForm({ livesWith }), [])
  const close = useCallback(() => setForm(null), [])

  const announceCreated = useCallback(
    (dog) => {
      setForm(null)
      toast(t('{name} ist jetzt dabei', { name: displayName(dog) }))
      navigate(`/tier/${dog.id}`, { state: { neuesTier: true } })
    },
    [navigate, toast]
  )

  return { form, open, close, announceCreated }
}
