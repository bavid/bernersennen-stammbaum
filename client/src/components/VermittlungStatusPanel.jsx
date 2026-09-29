import { useEffect, useState } from 'react'
import { api } from '../api'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'
import { useToast } from './Toast.jsx'
import { NO_STATUS_LABEL, STECKBRIEF_PUBLISHABLE_STATUS, VERMITTLUNG_STATUS_VALUES, vermittlungStatusLabel } from '../lib/vermittlung.js'

// "– kein Status –" ist legitim (final-review Phase T Finding 1) - ein frisch aufgenommenes Tier hat
// oft noch keinen Vermittlungsstatus, und die Option lässt ihn auch wieder entfernen.
const STATUS_OPTIONS = [
  { value: '', label: NO_STATUS_LABEL },
  ...VERMITTLUNG_STATUS_VALUES.map((value) => ({ value, label: vermittlungStatusLabel(value) }))
]

// Vermittlungsstatus ändern (Tierheim, final-review Phase T Finding 2): ein Statuswechsel kann zwei
// Nebenwirkungen haben, die auf den ersten Blick nicht sichtbar sind - einen offenen Übergabe-Gutschein
// entwerten (beim Verlassen von "reserviert", siehe routes/dogs.js updateDog/revokeOpenHandoverVouchers)
// und einen veröffentlichten Steckbrief zurückziehen (wenn der neue Status nicht mehr vermittelbar ist,
// siehe PUBLIC_SLUG_KEEP_SQL - "pausiert" zählt seit Phase P als vermittelbar, der Steckbrief bleibt).
// Bisher speicherte schon jede Pfeiltasten-Navigation im <select> sofort - jetzt erst ein bewusstes
// "Speichern", und bei einer der beiden Nebenwirkungen erst nach Bestätigung.
export default function VermittlungStatusPanel({ dog, onChange }) {
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const toast = useToast()
  const [value, setValue] = useState(dog.vermittlung_status || '')
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)

  // Von außen geänderter Status (z. B. "Übergabe zurückziehen" auf der Tierseite) synchron halten.
  useEffect(() => {
    setValue(dog.vermittlung_status || '')
    setConfirming(false)
  }, [dog.vermittlung_status])

  const dirty = value !== (dog.vermittlung_status || '')
  const revokesHandover = dog.vermittlung_status === 'reserviert' && value !== 'reserviert'
  const unpublishesSteckbrief = Boolean(dog.public_slug) && !STECKBRIEF_PUBLISHABLE_STATUS.includes(value)
  const needsConfirm = dirty && (revokesHandover || unpublishesSteckbrief)

  async function save() {
    setSaving(true)
    try {
      const updated = await api.updateDog(dog.id, { vermittlungStatus: value || null })
      onChange(updated)
      setConfirming(false)
      toast('Status aktualisiert')
    } catch (err) {
      toast(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleSaveClick() {
    if (needsConfirm && !confirming) {
      setConfirming(true)
      return
    }
    save()
  }

  function handleSelectChange(next) {
    setValue(next)
    setConfirming(false)
  }

  return (
    <div className="field vermittlung-status-panel">
      <label className="field-label" htmlFor="vermittlung-status">
        Status
      </label>
      <select id="vermittlung-status" value={value} disabled={isDemo || saving} onChange={(e) => handleSelectChange(e.target.value)}>
        {STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {dirty && !isDemo && (
        <>
          {confirming && (
            <div className="field-hint vermittlung-status-confirm" role="alert">
              {revokesHandover && <p>Der offene Übergabe-Code wird ungültig.</p>}
              {unpublishesSteckbrief && <p>Der Steckbrief wird zurückgezogen.</p>}
            </div>
          )}
          <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSaveClick}>
            {saving ? 'Speichere …' : confirming ? 'Bestätigen' : 'Speichern'}
          </button>
        </>
      )}

      {isDemo && <p className="field-hint">{readOnlyHint}</p>}
    </div>
  )
}
