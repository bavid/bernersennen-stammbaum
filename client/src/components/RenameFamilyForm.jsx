import { useEffect, useState } from 'react'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import Icon from './Icon.jsx'
import { t } from '../lib/i18n/index.js'

const MAX_NAME_LENGTH = 80
const ARM_TIMEOUT_MS = 5000

// Umbenennen mit Warnung und zweistufiger Bestätigung – der Name gilt für alle im Rudel.
export default function RenameFamilyForm({ family, onRenamed, onCancel }) {
  const { words } = useTheme()
  const [name, setName] = useState(family.name)
  const [armed, setArmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const trimmed = name.trim()
  const unchanged = trimmed === family.name

  useEffect(() => {
    if (!armed) return undefined
    const timer = setTimeout(() => setArmed(false), ARM_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [armed])

  async function handleSubmit(event) {
    event.preventDefault()
    if (!armed) {
      setArmed(true)
      return
    }
    setError(null)
    setSaving(true)
    try {
      onRenamed(await api.renameFamily(trimmed))
    } catch (err) {
      setError(err.message)
      setSaving(false)
      setArmed(false)
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      <div className="warning-banner" role="note">
        <Icon name="alert" />
        <div>
          <strong>{t('Das betrifft alle {inGroup}.', { inGroup: words.inGroup })}</strong>
          <p>
            {t(
              'Der neue Name erscheint sofort bei allen, die euer gemeinsames Passwort nutzen – auf jedem Gerät, im Kopfbereich und auf neuen Collagen. Das Passwort selbst bleibt gleich.'
            )}
          </p>
        </div>
      </div>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="field">
        <label className="field-label" htmlFor="family-rename">
          {words.newGroupName}
        </label>
        <input
          id="family-rename"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setArmed(false)
          }}
          maxLength={MAX_NAME_LENGTH}
          required
          autoFocus
        />
        <span className="field-hint">{t('Bisher: „{name}“', { name: family.name })}</span>
      </div>
      <div className="form-actions">
        <span className="form-actions-spacer" />
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {t('Abbrechen')}
        </button>
        <button
          type="submit"
          className={`btn ${armed ? 'btn-warning' : 'btn-primary'}`}
          disabled={saving || !trimmed || unchanged}
        >
          <Icon name={armed ? 'check' : 'edit'} />
          {saving ? t('Speichere …') : armed ? t('Ja, für alle umbenennen') : t('Umbenennen')}
        </button>
      </div>
    </form>
  )
}
