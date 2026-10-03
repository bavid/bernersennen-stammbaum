import { useState } from 'react'
import { api } from '../../api'
import { useToast } from '../Toast.jsx'

// Hinweis in den Einstellungen, wenn etwas nur aus dem eigenen Zuhause heraus geht (Tiere teilen, Name, Zugang,
// Einladungen) und gerade eine Familie aktiv ist: ein Knopf wechselt nach „Meine Chronik“ - man bleibt dabei auf der
// Einstellungen-Seite (gleiche Adresse, App.jsx mountet sie mit dem neuen Bereich neu).
export default function HomeSwitchNotice({ family, onFamilyChange, children }) {
  const toast = useToast()
  const [switching, setSwitching] = useState(false)

  async function handleSwitch() {
    setSwitching(true)
    try {
      onFamilyChange(await api.view(family.home.id))
    } catch (err) {
      toast(err.message)
      setSwitching(false)
    }
  }

  return (
    <div className="notice notice-with-action settings-switch">
      <p>{children}</p>
      <button type="button" className="btn btn-ghost" disabled={switching} onClick={handleSwitch}>
        Zu „Meiner Chronik“ wechseln
      </button>
    </div>
  )
}
