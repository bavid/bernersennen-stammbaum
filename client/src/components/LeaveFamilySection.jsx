import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { startRoute } from '../lib/areas.js'
import { useToast } from './Toast.jsx'
import Icon from './Icon.jsx'

const ARM_TIMEOUT_MS = 5000

// Eine Familie/ein Rudel verlassen: nur sinnvoll, wenn die eigene Identität ein Zuhause ist und
// gerade eine beigetretene Familie aktiv ist (der aktive Bereich, family). Der Server räumt beim
// Verlassen auch alle Freigaben der eigenen Tiere in diese Familie auf. Nach dem Verlassen landet
// man automatisch wieder im eigenen Zuhause (das "me" aus der Antwort trägt das schon).
export default function LeaveFamilySection({ family, onFamilyChange, onLeft }) {
  const { words } = useTheme()
  const navigate = useNavigate()
  const toast = useToast()
  const [armed, setArmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!armed) return undefined
    const timer = setTimeout(() => setArmed(false), ARM_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [armed])

  async function handleClick() {
    if (!armed) {
      setArmed(true)
      return
    }
    setError(null)
    setSaving(true)
    try {
      const me = await api.leaveFamily(family.id)
      onLeft?.()
      onFamilyChange(me)
      navigate(startRoute(me))
      toast(`Du hast „${family.name}“ verlassen. Deine geteilten Tiere sind dort nicht mehr sichtbar.`)
    } catch (err) {
      setError(err.message)
      setSaving(false)
      setArmed(false)
    }
  }

  return (
    <section className="settings-section leave-family-section">
      <h3>{words.leaveGroup}</h3>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <p className="muted">
        Ihr verlasst „{family.name}“. Eure geteilten Tiere sind dort danach nicht mehr sichtbar; eure eigene Chronik
        bleibt unverändert.
      </p>
      <button
        type="button"
        className={`btn ${armed ? 'btn-warning' : 'btn-ghost'}`}
        onClick={handleClick}
        disabled={saving}
      >
        <Icon name={armed ? 'check' : 'logout'} />
        {saving ? 'Verlasse …' : armed ? `Ja, „${family.name}“ verlassen` : words.leaveGroup}
      </button>
    </section>
  )
}
