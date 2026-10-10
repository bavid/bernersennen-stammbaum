import { useId, useRef, useState } from 'react'
import { api } from '../../api'
import { useReadOnlyHint } from '../../lib/demo.js'
import { personName, rememberPersonName, squareImage, withAreaBild } from '../../lib/profil.js'
import { useToast } from '../Toast.jsx'
import Icon from '../Icon.jsx'
import AreaAvatar from '../AreaAvatar.jsx'
import { Button } from '../ui/index.js'
import { useT } from '../../lib/i18n/index.js'

const MAX_NAME_LENGTH = 40

function ErrorLine({ error }) {
  if (!error) return null
  return (
    <p className="field-error" role="alert">
      {error}
    </p>
  )
}

// Einstellungen: „Euer Name“ der angemeldeten Person (server/lib/profil.js). Benutzer-Logins speichern ihn für sich, sonst
// gilt er für das Zuhause (bzw. beim klassischen Login für die Familie). Nach dem Speichern ist er die Vorgabe für neue
// Erinnerungen (rememberPersonName).
export function PersonNameGroup({ family, readOnly, onFamilyChange }) {
  const t = useT()
  const toast = useToast()
  const readOnlyHint = useReadOnlyHint()
  const inputId = useId()
  const [value, setValue] = useState(() => personName(family))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const changed = value.trim() !== personName(family)

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const person = await api.setPersonName(value)
      onFamilyChange((current) => ({ ...current, person }))
      rememberPersonName({ person })
      setValue(person.anzeigename || '')
      toast(t(person.anzeigename ? 'settings.person.saved' : 'settings.person.cleared'))
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="settings-group" aria-labelledby="settings-person-title">
      <h2 id="settings-person-title">{t('settings.person.title')}</h2>
      <p className="muted">{t(family?.auth?.kind === 'user' ? 'settings.person.subUser' : 'settings.person.sub')}</p>
      {readOnly && <p className="field-hint">{readOnlyHint}</p>}
      <form className="profil-name-form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor={inputId}>{t('settings.person.label')}</label>
          <input
            id={inputId}
            value={value}
            maxLength={MAX_NAME_LENGTH}
            autoComplete="given-name"
            placeholder={t('settings.person.placeholder')}
            disabled={readOnly}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
        <Button type="submit" variant="ghost" disabled={readOnly || saving || !changed}>
          {t('settings.person.save')}
        </Button>
      </form>
      <ErrorLine error={error} />
    </section>
  )
}

// Bild des aktiven Zuhauses bzw. der aktiven Familie: wählen (im Browser quadratisch zugeschnitten), ersetzen, entfernen.
// canEdit: Leitung (im eigenen Zuhause immer) - der Server prüft es ebenso. kind: 'home' | 'family' (nur der Erklärtext).
export function AreaBildGroup({ family, kind = 'home', canEdit = true, readOnly, onFamilyChange }) {
  const t = useT()
  const toast = useToast()
  const readOnlyHint = useReadOnlyHint()
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const disabled = readOnly || !canEdit || busy

  async function run(action, message) {
    setBusy(true)
    setError(null)
    try {
      const { bild } = await action()
      onFamilyChange((current) => withAreaBild(current, family.id, bild))
      toast(t(message))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) await run(async () => api.uploadAreaBild(await squareImage(file)), 'settings.bild.saved')
  }

  return (
    <section className="settings-group" aria-labelledby="settings-bild-title">
      <h2 id="settings-bild-title">{t('settings.bild.title')}</h2>
      <p className="muted">{t(kind === 'family' ? 'settings.bild.subFamily' : 'settings.bild.subHome')}</p>
      {readOnly && <p className="field-hint">{readOnlyHint}</p>}
      {!readOnly && !canEdit && <p className="field-hint">{t('settings.bild.leitungOnly')}</p>}
      <div className="profil-bild-row">
        <AreaAvatar name={family.name} bild={family.bild} size="xl" />
        <div className="settings-actions">
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleFile} data-testid="bild-input" />
          <Button variant="ghost" disabled={disabled} onClick={() => fileRef.current?.click()}>
            <Icon name="camera" />
            {busy ? t('settings.bild.uploading') : t(family.bild ? 'settings.bild.change' : 'settings.bild.choose')}
          </Button>
          {family.bild && (
            <Button variant="ghost" disabled={disabled} onClick={() => run(api.deleteAreaBild, 'settings.bild.removed')}>
              <Icon name="trash" />
              {t('settings.bild.remove')}
            </Button>
          )}
        </div>
      </div>
      <ErrorLine error={error} />
    </section>
  )
}
