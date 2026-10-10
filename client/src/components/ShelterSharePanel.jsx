import { useState } from 'react'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import { useToast } from './Toast.jsx'
import { displayName } from '../lib/timeline.js'
import Icon from './Icon.jsx'
import { t } from '../lib/i18n/index.js'

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
      {/* Die Überschrift ist der Stand: liest das Tierheim gerade mit oder nicht (die Checkbox darunter ändert ihn). */}
      <h2 id="shelter-share-title" className={share.enabled ? 'is-reading' : undefined}>
        {share.enabled && <Icon name="eye" />}
        {share.enabled ? t('{shelter} liest mit', { shelter: share.shelterName }) : t('{shelter} liest nicht mit', { shelter: share.shelterName })}
      </h2>
      <label className="check">
        <input type="checkbox" checked={share.enabled} disabled={disabled} onChange={(e) => toggleEnabled(e.target.checked)} />
        {t('{shelter} darf mitlesen', { shelter: share.shelterName })}
      </label>
      {/* Informed consent (final-review Phase T Finding 3): die Checkbox-Beschriftung allein sagt nicht,
          WAS "mitlesen" konkret bedeutet - der Hinweis macht es für die Einwilligung ausdrücklich. */}
      <p className="field-hint">
        {t('{shelter} sieht {name}, den Namen eures Zuhauses und alle nicht privaten {entries} (nur lesen und {greetings} schreiben)', {
          shelter: share.shelterName,
          name,
          entries: words.entries,
          greetings: words.greetings
        })}
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={share.storyConsent}
          disabled={disabled || !share.enabled}
          onChange={(e) => toggleStoryConsent(e.target.checked)}
        />
        {t('{shelter} darf {name} mit Foto und der neuesten nicht privaten {entry} öffentlich auf seiner Portalseite zeigen (Happy End)', {
          shelter: share.shelterName,
          name,
          entry: words.entry
        })}
      </label>
      {isDemo && <p className="field-hint">{readOnlyHint}</p>}
    </section>
  )
}
