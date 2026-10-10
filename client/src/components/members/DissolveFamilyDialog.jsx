import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import { useIsDemo, useReadOnlyHint } from '../../lib/demo.js'
import Icon from '../Icon.jsx'
import { t } from '../../lib/i18n/index.js'
import { Button } from '../ui/index.js'

const HAS_ANIMALS_STATUS = 409

// Familie auflösen (nur Leitung, server/routes/members.js POST /aufloesen): erst die Erklärung, dann der
// genaue Name als Bestätigung. Hat die Familie noch eigene Tiere, antwortet der Server mit 409 - dann
// erscheinen sie hier als Links zur Tierseite, wo "In meine Chronik übernehmen" steht (DogDetailPage).
// onDissolved bekommt das neue "me" (eigenes Zuhause) bzw. null, wenn die Sitzung mit der Familie endete.
export default function DissolveFamilyDialog({ family, onDissolved, onClose }) {
  const { words } = useTheme()
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()
  const [name, setName] = useState('')
  const [error, setError] = useState(null)
  const [animals, setAnimals] = useState(null)
  const [saving, setSaving] = useState(false)
  const matches = name.trim() === family.name

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      onDissolved(await api.dissolveFamily(name.trim()))
    } catch (err) {
      setError(err.message)
      if (err.status === HAS_ANIMALS_STATUS) {
        try {
          const dogs = await api.listDogs()
          setAnimals(dogs.filter((dog) => dog.can_edit))
        } catch {
          setAnimals([])
        }
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="form-stack dissolve-dialog" onSubmit={handleSubmit}>
      <div className="warning-banner" role="note">
        <Icon name="alert" />
        <div>
          <strong>{t('Das lässt sich nicht rückgängig machen.')}</strong>
          <p>
            {t(
              '{tree}, Pinnwand, {greetings} und offene Einladungen {ofGroup} werden gelöscht. Die Tiere der Mitglieder bleiben in ihrem eigenen Zuhause – sie sind danach nur nicht mehr hier zu sehen.',
              { tree: words.treeLabel, greetings: words.greetings, ofGroup: words.ofGroup }
            )}
          </p>
        </div>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {animals && (
        <div className="dissolve-animals">
          <p className="muted">
            {animals.length > 0
              ? t('Diese Tiere gehören noch {ofGroup} selbst. Übernimm sie zuerst in „Mein Zuhause“ – auf der Tierseite:', { ofGroup: words.ofGroup })
              : t('Die Tiere ließen sich gerade nicht laden – schau {inTree} nach.', { inTree: words.inTree })}
          </p>
          {animals.length > 0 && (
            <ul className="chip-list">
              {animals.map((dog) => (
                <li key={dog.id}>
                  <Link to={`/tier/${dog.id}`} className="chip" onClick={onClose}>
                    {dog.name} · {t('In „Mein Zuhause“ übernehmen')}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="field">
        <label className="field-label" htmlFor="dissolve-name">
          {t('Zur Bestätigung: der genaue Name')}
        </label>
        <input
          id="dissolve-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={family.name}
          autoComplete="off"
          disabled={isDemo}
          required
        />
        <span className="field-hint">{t('Tipp „{name}“ ein, um {theGroup} aufzulösen.', { name: family.name, theGroup: words.theGroup })}</span>
      </div>
      {isDemo && <p className="field-hint">{readOnlyHint}</p>}
      <div className="form-actions">
        <span className="form-actions-spacer" />
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('Abbrechen')}
        </Button>
        <Button type="submit" variant="danger" className="is-armed" disabled={isDemo || saving || !matches}>
          <Icon name="trash" />
          {saving ? t('Löse auf …') : words.dissolveGroup}
        </Button>
      </div>
    </form>
  )
}
