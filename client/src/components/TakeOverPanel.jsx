import { useState } from 'react'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { useIsDemo } from '../lib/demo.js'
import { displayName } from '../lib/timeline.js'
import useArmed from '../hooks/useArmed.js'
import Icon from './Icon.jsx'

const DEMO_HINT_ID = 'take-over-demo-hint'

// Tier der Familie in die eigene Chronik übernehmen (Phase R, server/routes/dogs.js POST /:id/uebernehmen):
// nur die Leitung mit eigenem Zuhause sieht das (DogDetailPage canTakeOver). Zweistufig, mit Erklärung:
// das Tier zieht samt Chronik in „Meine Chronik“ um und bleibt in der Familie als geteiltes Tier sichtbar.
// onTakenOver: die Seite lädt danach neu (das Tier gehört jetzt einem anderen Bereich).
export default function TakeOverPanel({ dog, onTakenOver }) {
  const { words } = useTheme()
  const isDemo = useIsDemo()
  const [armed, setArmed] = useArmed()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const name = displayName(dog)

  async function handleClick() {
    if (!armed) {
      setArmed(true)
      return
    }
    setError(null)
    setSaving(true)
    try {
      await api.takeOverDog(dog.id)
      await onTakenOver()
    } catch (err) {
      setError(err.message)
      setSaving(false)
      setArmed(false)
    }
  }

  return (
    <section className="take-over-panel notice notice-with-action" aria-labelledby="take-over-title">
      <div>
        <p id="take-over-title">
          <strong>{name} gehört {words.ofGroup} selbst.</strong>
        </p>
        <p className="take-over-text">
          Übernimmst du {name} in deine Chronik, zieht {name} mit allen Einträgen zu dir um – und bleibt hier als geteiltes
          Tier sichtbar. Nötig, bevor sich {words.theGroup} auflösen lässt.
        </p>
        {error && (
          <p className="reply-error" role="alert">
            {error}
          </p>
        )}
        {isDemo && (
          <p className="field-hint" id={DEMO_HINT_ID}>
            In der Demo nicht möglich.
          </p>
        )}
      </div>
      <button
        type="button"
        className={`btn ${armed ? 'btn-warning' : 'btn-ghost'}`}
        disabled={isDemo || saving}
        aria-describedby={isDemo ? DEMO_HINT_ID : undefined}
        onClick={handleClick}
      >
        <Icon name={armed ? 'check' : 'home'} />
        {saving ? 'Übernehme …' : armed ? 'Ja, in meine Chronik übernehmen' : 'In meine Chronik übernehmen'}
      </button>
    </section>
  )
}
