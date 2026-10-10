import { useState } from 'react'
import { useToast } from '../components/Toast.jsx'
import { t } from '../lib/i18n/index.js'

// Entwurf der Kartengestaltung (components/visitenkarte/KartenDesigner.jsx): die Gestaltung, ob sie gespeichert ist,
// und Speichern. Übernommen wird nur, was gespeichert wurde: wer während des Speicherns weiter ändert, behält seine
// Änderungen (und sieht "Noch nicht gespeichert").
// initial/gespeichert: der Stand vom Server; override: Felder, die der Entwurf von Anfang an anders hat (z. B. die
// Kombination aus der Adresse - dann gilt er als nicht gespeichert, bis man speichert). toPayload: genau die Felder des
// PUT; isSame: Vergleich zweier Gestaltungen; request(payload): der PUT (Antwort: der ganze Stand); pick(result): die
// gespeicherte Gestaltung aus der Antwort; onSaved(result): danach (z. B. Zähler).
export default function useKartenEntwurf({ initial, gespeichert, override = null, toPayload, isSame, request, pick, onSaved }) {
  const toast = useToast()
  const [design, setDesign] = useState(() => (override ? { ...initial, ...override } : initial))
  const [saved, setSaved] = useState(gespeichert ? initial : null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const update = (patch) => setDesign((current) => ({ ...current, ...patch }))

  async function save() {
    const payload = toPayload(design)
    setError(null)
    setSaving(true)
    try {
      const result = await request(payload)
      const next = pick(result)
      setSaved(next)
      setDesign((current) => (isSame(current, payload) ? next : current))
      onSaved?.(result)
      toast(t('Gestaltung gespeichert.'))
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return { design, update, dirty: !isSame(design, saved), saving, error, save }
}
