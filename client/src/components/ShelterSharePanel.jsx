import { useState } from 'react'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import { useToast } from './Toast.jsx'
import { displayName } from '../lib/timeline.js'

// Einwilligung "Tierheim darf mitlesen" (Phase T Task 5) - auf der Tierseite im eigenen Zuhause, nur
// wenn dog.shelterShare überhaupt etwas zum Verwalten kennt (dog_transfers kennt ein abgebendes
// Tierheim, siehe server routes/dogs.js shelterShareFor - sonst rendert DogDetailPage diese Sektion gar
// nicht erst). Schreibt optimistisch wie SharePanel: sofort umschalten, bei einem Fehler zurück und ein
// Toast erklärt, warum. onChange bekommt die neue, rohe shelterShare-Antwort des Servers (nicht den
// ganzen Hund) - DogDetailPage mischt sie in dog.shelterShare (siehe dort handleShelterShareChange).
export default function ShelterSharePanel({ dog, onChange }) {
  const { words } = useTheme()
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const toast = useToast()
  const [share, setShare] = useState(dog.shelterShare)
  const [saving, setSaving] = useState(false)
  const disabled = isDemo || saving
  const name = displayName(dog)

  async function update(next) {
    const previous = share
    setShare(next)
    setSaving(true)
    try {
      const result = await api.setShelterShare(dog.id, { enabled: next.enabled, storyConsent: next.storyConsent })
      setShare(result)
      onChange?.(result)
    } catch (err) {
      setShare(previous)
      toast(err.message)
    } finally {
      setSaving(false)
    }
  }

  // Mitlesen abschalten nimmt die Happy-End-Einwilligung gleich mit - sie ergibt ohne Mitlesen keinen Sinn.
  function toggleEnabled(checked) {
    update({ enabled: checked, storyConsent: checked ? share.storyConsent : false })
  }

  function toggleStoryConsent(checked) {
    update({ enabled: share.enabled, storyConsent: checked })
  }

  return (
    <section className="shelter-share-panel" aria-labelledby="shelter-share-title">
      <h2 id="shelter-share-title">Tierheim</h2>
      <label className="check">
        <input type="checkbox" checked={share.enabled} disabled={disabled} onChange={(e) => toggleEnabled(e.target.checked)} />
        {share.shelterName} darf mitlesen
      </label>
      {/* Informed consent (final-review Phase T Finding 3): die Checkbox-Beschriftung allein sagt nicht,
          WAS "mitlesen" konkret bedeutet - der Hinweis macht es für die Einwilligung ausdrücklich. */}
      <p className="field-hint">
        {share.shelterName} sieht {name} und alle nicht privaten {words.entries} (nur lesen und {words.greetings} schreiben)
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={share.storyConsent}
          disabled={disabled || !share.enabled}
          onChange={(e) => toggleStoryConsent(e.target.checked)}
        />
        {share.shelterName} darf {name} mit Foto und der neuesten nicht privaten {words.entry} öffentlich auf seiner
        Portalseite zeigen (Happy End)
      </label>
      {isDemo && <p className="field-hint">{readOnlyHint}</p>}
    </section>
  )
}
