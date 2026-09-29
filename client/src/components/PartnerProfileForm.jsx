import { useState } from 'react'
import { api } from '../api'
import { useIsDemo } from '../lib/demo.js'
import {
  DEMO_HINT,
  MAX_NAME_LENGTH,
  MAX_PORTAL_TEXT_LENGTH,
  MIN_PORTAL_TEXT_LENGTH,
  changedProfileFields,
  hasShelterLinks,
  profileErrorField,
  profileForm
} from '../lib/partnerProfile.js'
import useFocusFirstError from '../hooks/useFocusFirstError.js'
import AdminField, { fieldProps } from './AdminField.jsx'
import AdminImageUpload from './AdminImageUpload.jsx'
import ColorField from './ColorField.jsx'
import { useToast } from './Toast.jsx'

const SAVE_DEMO_HINT_ID = 'profile-save-demo-hint'

function withoutKeys(object, keys) {
  return Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)))
}

// Ein Eingabefeld des Profils: Label, Hinweis und Feldfehler über AdminField, id = profile-<name>.
function ProfileInput({ name, label, hint, form, errors, update, className = '', ...inputAttributes }) {
  const id = `profile-${name}`
  const error = errors[name]
  return (
    <AdminField id={id} label={label} hint={hint} error={error} className={`${error ? 'has-error' : ''} ${className}`.trim()}>
      <input {...fieldProps(id, { error, hint })} value={form[name]} onChange={(e) => update({ [name]: e.target.value })} {...inputAttributes} />
    </AdminField>
  )
}

function portalTextHint(length) {
  const minimum = length < MIN_PORTAL_TEXT_LENGTH ? ` · mindestens ${MIN_PORTAL_TEXT_LENGTH} zum Veröffentlichen` : ''
  return `${length} / ${MAX_PORTAL_TEXT_LENGTH} Zeichen${minimum}`
}

// Reiter "Angaben" auf /profil: Auftritt, Links, Kontakt, Standort. Speichern schickt nur geänderte
// Felder (changedProfileFields); Fehler vom Server stehen am passenden Feld (profileErrorField), sonst
// - z. B. die Ablehnung "Solange euer Profil öffentlich ist …" mit fehlt - oben im Banner. Das Logo
// speichert sofort über einen eigenen Endpunkt (onLogoUploaded).
export default function PartnerProfileForm({ profile, onSaved, onLogoUploaded }) {
  const isDemo = useIsDemo()
  const toast = useToast()
  const [form, setForm] = useState(() => profileForm(profile))
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const { formRef, bannerRef, focusFirstError } = useFocusFirstError()

  const changes = changedProfileFields(form, profile)
  const isDirty = Object.keys(changes).length > 0
  const fieldState = { form, errors: fieldErrors, update }

  function update(patch) {
    setForm((current) => ({ ...current, ...patch }))
    setFieldErrors((current) => withoutKeys(current, Object.keys(patch)))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (isDemo || !isDirty) return
    setError(null)
    setFieldErrors({})
    setSaving(true)
    try {
      const saved = await api.partnerArea.updateProfile(changes)
      setForm(profileForm(saved))
      onSaved(saved)
      toast('Gespeichert.')
    } catch (err) {
      const field = err.details?.fehlt ? null : profileErrorField(err.message)
      if (field) setFieldErrors({ [field]: err.message })
      else setError(err.message)
      focusFirstError()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form ref={formRef} className="partner-profile-form form-stack" onSubmit={handleSubmit} noValidate>
      {error && (
        <div ref={bannerRef} className="error-banner" role="alert" tabIndex={-1}>
          {error}
        </div>
      )}

      <fieldset className="partner-fieldset">
        <legend>Auftritt</legend>
        <div className="form-grid">
          <ProfileInput name="name" label="Name" maxLength={MAX_NAME_LENGTH} autoComplete="organization" {...fieldState} />
          <ProfileInput name="portalTitel" label="Portal-Titel" maxLength={120} placeholder={`Willkommen bei ${form.name || '…'}`} {...fieldState} />
          <AdminField
            id="profile-portalText"
            label="Portal-Text"
            hint={portalTextHint(form.portalText.length)}
            error={fieldErrors.portalText}
            className={`span-2 ${fieldErrors.portalText ? 'has-error' : ''}`.trim()}
          >
            <textarea
              {...fieldProps('profile-portalText', { error: fieldErrors.portalText, hint: true })}
              value={form.portalText}
              onChange={(e) => update({ portalText: e.target.value })}
              maxLength={MAX_PORTAL_TEXT_LENGTH}
              rows={5}
            />
          </AdminField>
          <ColorField id="profile-farbe" label="Farbe" value={form.farbe} error={fieldErrors.farbe} onChange={(farbe) => update({ farbe })} />
          <div className="partner-logo-field">
            <AdminImageUpload
              label="Logo"
              buttonLabel="Logo hochladen"
              imageUrl={profile.logoUrl}
              disabled={isDemo}
              upload={async (file) => (await api.partnerArea.uploadLogo(file)).logoUrl}
              onUploaded={onLogoUploaded}
            />
            {isDemo && <p className="field-hint">{DEMO_HINT}</p>}
          </div>
        </div>
      </fieldset>

      <fieldset className="partner-fieldset">
        <legend>Links</legend>
        <div className="form-grid">
          <ProfileInput name="website" label="Website" type="url" placeholder="https://…" className="span-2" {...fieldState} />
          {hasShelterLinks(profile.typ) && (
            <>
              <ProfileInput name="spendenUrl" label="Spenden-Link" type="url" placeholder="https://…" {...fieldState} />
              <ProfileInput name="vermittlungUrl" label="Vermittlungs-Link" type="url" placeholder="https://…" {...fieldState} />
            </>
          )}
        </div>
      </fieldset>

      <fieldset className="partner-fieldset">
        <legend>Kontakt</legend>
        <div className="form-grid">
          <ProfileInput name="kontaktEmail" label="E-Mail" type="email" autoComplete="email" {...fieldState} />
          <ProfileInput name="kontaktTelefon" label="Telefon" type="tel" autoComplete="tel" {...fieldState} />
          <ProfileInput
            name="kontaktFormularUrl"
            label="Kontaktformular-URL"
            type="url"
            placeholder="https://…"
            hint="Link zu eurem eigenen Kontaktformular"
            className="span-2"
            {...fieldState}
          />
          <div className="field span-2">
            <label className="check">
              <input
                type="checkbox"
                checked={form.kontaktformularAktiv}
                onChange={(e) => update({ kontaktformularAktiv: e.target.checked })}
                aria-describedby="profile-kontaktformularAktiv-hint"
              />
              Formular ‚Schreib uns‘ anbieten
            </label>
            <p className="field-hint" id="profile-kontaktformularAktiv-hint">
              kommt bald – Nachrichten landen dann in eurem Postfach hier
            </p>
          </div>
        </div>
      </fieldset>

      <fieldset className="partner-fieldset">
        <legend>Standort</legend>
        <div className="form-grid">
          <ProfileInput
            name="plz"
            label="Postleitzahl"
            inputMode="numeric"
            maxLength={5}
            autoComplete="postal-code"
            hint={profile.ort && form.plz === profile.plz ? `Ort: ${profile.ort}` : undefined}
            {...fieldState}
            update={(patch) => update({ plz: patch.plz.replace(/\D/g, '').slice(0, 5) })}
          />
        </div>
      </fieldset>

      <div className="form-actions">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isDemo || saving || !isDirty}
          aria-describedby={isDemo ? SAVE_DEMO_HINT_ID : undefined}
        >
          {saving ? 'Speichere …' : 'Speichern'}
        </button>
        {!isDirty && !isDemo && <span className="field-hint">Keine ungespeicherten Änderungen.</span>}
        {isDemo && (
          <span id={SAVE_DEMO_HINT_ID} className="field-hint">
            {DEMO_HINT}
          </span>
        )}
      </div>
    </form>
  )
}
