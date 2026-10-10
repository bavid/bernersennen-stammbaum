import { useId, useState } from 'react'
import { api } from '../api'
import MehrAngaben from './MehrAngaben.jsx'
import PortraitFeld from './animals/PortraitFeld.jsx'
import TierartWahl from './animals/TierartWahl.jsx'
import TierMehrAngaben from './animals/TierMehrAngaben.jsx'
import useFocusFirstError from '../hooks/useFocusFirstError.js'
import { choiceTierart, emptyAnimal, moreSummary, newAnimalErrors, newAnimalPayload } from '../lib/newAnimal.js'
import { SEX_CHOICES, livesWithLabel } from '../lib/timeline.js'
import '../styles/neues-tier.css'
import { t } from '../lib/i18n/index.js'
import { Button } from './ui/index.js'

const NAME_PLACEHOLDER = { hund: 'z. B. Benno', katze: 'z. B. Minka', anderes: 'z. B. Hoppel' }

// „Neues Tier“ - nur Tierart (große Chips) und Name sind nötig, dazu auf Wunsch ein rundes Porträt und das (vorbelegte,
// sichtbare) Geschlecht; Rasse, Geburtstag, „bei uns seit“, Beschreibung, Eltern und „Lebt mit“ stehen zugeklappt unter
// „Mehr Angaben“ (lib/newAnimal.js).
// livesWith (Stammbaum, Tierseite) macht „lebt mit“ fest; shelter (Tierheim, „Tier aufnehmen“) startet „in Vermittlung“.
// onCreated bekommt das angelegte Tier (hooks/useAnimalCreate.js: weiter zur Tierseite). Fehler stehen am Feld.
export default function QuickAnimalForm({ allDogs, ownFamilyId, livesWith = null, shelter = false, onCreated, onCancel }) {
  const nameId = useId()
  const kindId = useId()
  const nameErrorId = useId()
  const sexId = useId()
  const [form, setForm] = useState(emptyAnimal)
  const [errors, setErrors] = useState({})
  const [moreOpen, setMoreOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const { formRef, bannerRef, focusFirstError } = useFocusFirstError()
  const tierart = choiceTierart(form.art)

  // Ein geänderter Wert nimmt nur seinen eigenen Fehler weg.
  const update = (patch) => {
    setForm((current) => ({ ...current, ...patch }))
    const cleared = 'art' in patch ? 'art' : 'name' in patch || 'nameUnbekannt' in patch ? 'name' : null
    if (cleared) setErrors((current) => (current[cleared] ? { ...current, [cleared]: undefined } : current))
  }

  // Eltern einer anderen Tierart passen nicht mehr (der Server lehnt sie ab).
  function selectArt(art) {
    const sameKind = choiceTierart(art) === tierart
    update({ art, ...(sameKind ? {} : { mother: { dogId: '', freitext: form.mother.freitext }, father: { dogId: '', freitext: form.father.freitext } }) })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    const found = newAnimalErrors(form)
    setErrors(found)
    if (Object.values(found).some(Boolean)) {
      focusFirstError()
      return
    }
    setSaving(true)
    try {
      const dog = await api.createDog(newAnimalPayload(form, { livesWith, shelter }))
      onCreated(dog)
    } catch (err) {
      setError(err.message)
      setSaving(false)
      focusFirstError()
    }
  }

  return (
    <form className="quick-animal-form" ref={formRef} onSubmit={handleSubmit} noValidate>
      {error && (
        <div className="error-banner" role="alert" ref={bannerRef} tabIndex={-1}>
          {error}
        </div>
      )}
      <TierartWahl value={form.art} onChange={selectArt} error={errors.art} />
      {form.art === 'anderes' && (
        <div className="field">
          <label className="field-label" htmlFor={kindId}>
            {t('Welches Tier?')} <span className="muted">{t('(optional)')}</span>
          </label>
          <input id={kindId} name="artText" value={form.artText} onChange={(e) => update({ artText: e.target.value })} placeholder={t('z. B. Schildkröte')} maxLength={120} />
        </div>
      )}
      <div className="quick-animal-who">
        <PortraitFeld value={form.fotos} onChange={(fotos) => update({ fotos })} onBusyChange={setUploading} onError={setError} />
        <div className="field">
          <label className="field-label" htmlFor={nameId}>
            {t('Name')}
          </label>
          <input
            id={nameId}
            name="name"
            value={form.nameUnbekannt ? '' : form.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder={form.nameUnbekannt ? t('Wird als „Unbekannt“ geführt') : t(NAME_PLACEHOLDER[tierart])}
            maxLength={80}
            disabled={form.nameUnbekannt}
            autoFocus
            data-autofocus=""
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? nameErrorId : undefined}
          />
          <label className="check quick-animal-unknown">
            <input type="checkbox" name="nameUnbekannt" checked={form.nameUnbekannt} onChange={(e) => update({ nameUnbekannt: e.target.checked })} />
            {t('Name unbekannt')}
          </label>
          {errors.name && (
            <p className="field-error" id={nameErrorId}>
              {errors.name}
            </p>
          )}
        </div>
      </div>
      <div className="field quick-animal-sex">
        <span className="field-label" id={sexId}>
          {t('Geschlecht')}
        </span>
        <div className="segmented sex-choice" role="group" aria-labelledby={sexId}>
          {SEX_CHOICES.map((choice) => (
            <button key={choice.value} type="button" aria-pressed={form.geschlecht === choice.value} onClick={() => update({ geschlecht: choice.value })}>
              {t(choice.label)}
            </button>
          ))}
        </div>
      </div>
      {livesWith && <p className="quick-animal-fixed-housemate">{livesWithLabel([livesWith])}</p>}
      <MehrAngaben label={t('Mehr Angaben')} summary={moreSummary(form)} open={moreOpen} onToggle={setMoreOpen}>
        <TierMehrAngaben form={form} onChange={update} allDogs={allDogs} ownFamilyId={ownFamilyId} livesWith={livesWith} />
      </MehrAngaben>
      <div className="form-actions">
        <span className="form-actions-spacer" />
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('Abbrechen')}
        </Button>
        <Button type="submit" disabled={saving || uploading}>
          {saving ? t('Speichere …') : t('Tier anlegen')}
        </Button>
      </div>
    </form>
  )
}
